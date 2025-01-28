---
layout: post
title:  "Rails Migration Pitfalls"
date:   2024-01-27 11:47:00 +0200
categories: rails
---

## Migrating Integer enum to string

If you have an enum like 
`enum :status, %i[ pending processed failed ]`
and would like to migrate to a string backed enum
`enum :status, %w[ pending processed failed ].index_by(&:itself)`

```ruby
class ChangeEnumFromIntegerToString < ActiveRecord::Migration[8.0]
  def up
    change_column :stripe_events, :status,
      :string,
      default: nil,
      using: "CASE status
              WHEN 0 THEN 'pending'
              WHEN 1 THEN 'processed'
              WHEN 2 THEN 'failed'
              END"
    change_column_default :stripe_events, :status, "pending"
  end

  def down
    change_column :stripe_events, :status,
      :integer,
      default: nil,
      using: "CASE status
              WHEN 'pending'   THEN 0
              WHEN 'processed' THEN 1
              WHEN 'failed'    THEN 2
              END"
    change_column_default :stripe_events, :status, 0
  end
end

```
