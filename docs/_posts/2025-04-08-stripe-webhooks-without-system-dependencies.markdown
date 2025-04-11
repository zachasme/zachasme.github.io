---
title: "Stripe Webhooks Without System Dependencies"
permalink: /stripe-webhooks-without-system-dependencies
date:  2025-04-08 10:30:00 +0200
categories: rails
layout: post
---

Setting up Stripe webhooks in development usually requires installing [Stripe CLI](https://docs.stripe.com/stripe-cli) as a system dependency, authenticating against the right Stripe account and running it in a separate process. Alternatively, you might use a forwarding service like `ngrok`, but that also requires additional setup for new development environments (not to mention you will recieve *all* events across *all* developers for the associated Stripe test-mode/sandbox webhook).

But not if you use [`stripe-cli-ruby`](https://github.com/zachasme/stripe-cli-ruby)! It works by wrapping up the platform-specific Stripe CLI executable, authenticating using your `Stripe.api_key`, and running the `stripe listen` command as a puma plugin.

Let's see how it works.

## Stripe CLI as a Puma plugin

Running `stripe listen` as a separate process will force you to depend on something like `foreman`, unless we run it together with Puma as a plugin:

```ruby
# lib/puma/plugin/stripe.rb
Puma::Plugin.create do
  def start(launcher)
    launcher.events.on_booted do
      fork do
        exec "stripe listen --api-key #{Stripe.api_key} --forward-to http://localhost:3000/stripe_event"
      end
    end
  end
end

# config/puma.rb
plugin :stripe if ENV["RAILS_ENV"] == "development"
```

While we're at it, let's grab the signing key so we can run the same verification routine we do in production:

```ruby
secret = `stripe listen --api-key "#{Stripe.api_key}" --print-secret`.chomp
```

This is how our webhook handler might look:

```ruby
class StripeEventsController < ActionController::API
  before_action :set_event

  def create
    case event.type
    when 'payment_intent.succeeded'
      payment_intent = event.data.object
      # ...
    end

    head :ok
  end

  private
    def event
      @event ||= Stripe::Webhook.construct_event(
        request.body.read,
        request.headers["stripe-signature"],
        `stripe listen --api-key "#{Stripe.api_key}" --print-secret`.chomp
      )
    rescue => error
      logger.error error
      head :bad_request
    end
end
```

## Stripe CLI as a Ruby gem

So far so good, however, we still depend on developers installing [Stripe CLI](https://docs.stripe.com/stripe-cli) on their system. What if we could install it as a regular ruby gem? That's exactly what I've done in [`stripe-cli-ruby`](https://github.com/zachasme/stripe-cli-ruby), which includes the puma plugin for good measure.

With that, `bin/setup` will download, authenticate and run Stripe CLI as part of your development server.
