---
layout: post
title:  "Rails Migration Pitfalls"
date:   2024-07-15 15:17:52 +0200
categories: rails
---

## Migrating Integer enum to string

```ruby
class ChangeStripeEventEnumToString < ActiveRecord::Migration[8.0]
  # Before migration:
  #   t.integer "status", default: 0, null: false
  #   enum :status, { pending: 0, processing: 1, processed: 2, failed: 3 }
  #
  # After migration:
  #   t.string "status", default: "pending", null: false
  #   enum :status, %w[ pending processing processed failed ].index_by(&:itself)
  def up
    change_column :stripe_events, :status, :string,
      default: nil,
      using: "CASE status
              WHEN 0 THEN 'pending'
              WHEN 1 THEN 'processing'
              WHEN 2 THEN 'processed'
              WHEN 3 THEN 'failed'
              END"
    change_column_default :stripe_events, :status, "pending"
  end

  def down
    change_column :stripe_events, :status, :integer,
    default: nil,
    using: "CASE status
            WHEN 'pending' THEN 0
            WHEN 'processing' THEN 1
            WHEN 'processed' THEN 2
            WHEN 'failed' THEN 3
            END"
    change_column_default :stripe_events, :status, 0
  end
end

```
