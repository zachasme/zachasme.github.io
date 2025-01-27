---
layout: post
title:  "Rails Migration Pitfalls"
date:   2024-07-15 15:17:52 +0200
categories: rails
---

## `rename_table`

### Polymorphic associations

If you are renaming a class, and have polymorphic associations (including ActiveStorage attachments) pointing to your class, you will have to update the data stored in the type column.

```ruby
ActiveStorage::Attachment.where(record_type: 'User').update_all(record_type: 'Person')
```
