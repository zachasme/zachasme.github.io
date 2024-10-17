---
layout: post
title:  "SQLite Full-text Search in Rails"
date:   2024-09-09 12:47:00 +0200
categories: rails
---

Rails recently landed support for SQLite3 full-text search ([PR #52354](https://github.com/rails/rails/pull/52354)). Let's walk through how you can add a search index to an existing table of messages (TL;DR skip to the <a href="#message-model">finished model</a>).

Assuming we already have the following table:

```ruby
# db/migrations/..._create_messages.rb
create_table :messages do |t|
  t.string :title
  t.string :body
  t.timestamps
end
```

We can create a full-text index (in an [external content table](https://www.sqlite.org/fts5.html#external_content_tables) to avoid duplicating row content) using:

```ruby
# db/migrations/..._create_messages_search_index.rb
create_virtual_table :messages_search_index, :fts5, [
  'title', 'body',
  'content=messages',
  "content_rowid=id"
]
```

In order to keep the index in sync, we need to set up a few callbacks (lovingly lifted from [Campfire](https://once.com/campfire)):

```ruby
class Message < ApplicationRecord
  # ...

  after_create_commit  :create_in_search_index
  after_update_commit  :update_in_search_index
  after_destroy_commit :remove_from_search_index

  # ...

  private
    def create_in_search_index
      execute_sql_with_binds "insert into messages_search_index (rowid, title, body) values (?, ?, ?)", id, title, body
    end

    def update_in_search_index
      transaction do
        remove_from_search_index
        create_in_search_index
      end
    end

    def remove_from_search_index
      execute_sql_with_binds "insert into messages_search_index (messages_search_index, rowid, title, body) values ('delete', ?, ?, ?)", id_previously_was, title_previously_was, body_previously_was
    end

    def execute_sql_with_binds(*statement)
      self.class.connection.execute self.class.sanitize_sql(statement)
    end
end
```

To perform the actual search, we join on the index table:

```ruby
scope :search, ->(query) do
  joins("join messages_search_index idx on messages.id = idx.rowid")
  .where("messages_search_index match ?", query)
end
```

When presenting search results, you can use the `snippet` auxiliary function which is similar to the `highlight` Rails helper:

```ruby
scope :with_snippets, ->(**options) do
  select("messages.*")
  .select_snippet("title", 0, **options)
  .select_snippet("body", 1, **options)
end

# ...

private
  def self.select_snippet(column, offset, tag: "mark", omission: "…", limit: 32)
    select("snippet(messages_search_index, #{offset}, '<#{tag}>', '</#{tag}>', '#{omission}', #{limit}) AS #{column}_snippet")
  end
```

Finally, if you have existing and unindexed rows in your data table, or wish to use the index on test fixtures, you will have to rebuild the search index:

```ruby
def self.rebuild_search_index
  connection.execute "INSERT INTO messages_search_index(messages_search_index) VALUES('rebuild')"
end
```

<span id="message-model">The finished model looks like this:</span>

```ruby
class Message < ApplicationRecord
  scope :search, ->(query) do
    joins("join messages_search_index idx on messages.id = idx.rowid")
    .where("messages_search_index match ?", query)
  end

  scope :with_snippets, ->(**options) do
    select("messages.*")
    .select_snippet("title", 0, **options)
    .select_snippet("body", 1, **options)
  end

  scope :ranked, -> { order(:rank) }

  after_create_commit  :create_in_search_index
  after_update_commit  :update_in_search_index
  after_destroy_commit :remove_from_search_index

  def self.rebuild_search_index
    connection.execute "INSERT INTO messages_search_index(messages_search_index) VALUES('rebuild')"
  end

  private
    def self.select_snippet(column, offset, tag: "mark", omission: "…", limit: 32)
      select("snippet(messages_search_index, #{offset}, '<#{tag}>', '</#{tag}>', '#{omission}', #{limit}) AS #{column}_snippet")
    end

    def create_in_search_index
      execute_sql_with_binds "insert into messages_search_index (rowid, title, body) values (?, ?, ?)", id, title, body
    end

    def update_in_search_index
      transaction do
        remove_from_search_index
        create_in_search_index
      end
    end

    def remove_from_search_index
      execute_sql_with_binds "insert into messages_search_index (messages_search_index, rowid, title, body) values ('delete', ?, ?, ?)", id_previously_was, title_previously_was, body_previously_was
    end

    def execute_sql_with_binds(*statement)
      self.class.connection.execute self.class.sanitize_sql(statement)
    end
end
```

That's it - you can query your messages using the [FTS5 Full-text Query Syntax](https://www.sqlite.org/fts5.html#full_text_query_syntax):

```ruby
class MessagesController < ApplicationController
  def index
    @messages = Message.search("foo OR bar").with_snippets.ranked
  end
end
```

Remember to `Message.rebuild_search_index` in your tests before using fixtures!