---
layout: post
title:  "Rails & Stripe DX"
date:   2024-01-28 19:42:00 +0200
categories: rails
---

Draft:
- QoL improvements for ails

# Stripe listen as puma plugin

```ruby
# lib/puma/plugin/stripe.rb
Puma::Plugin.create do
  def start(launcher)
    key = Rails.configuration.stripe_secret_key

    launcher.events.on_booted do
      fork do
        exec "stripe listen --api-key #{key} --forward-to localhost:3000/stripe_event"
      end
    end
  end
end

# config/puma.rb
plugin :stripe unless ENV["RAILS_ENV"] == "production"
```
