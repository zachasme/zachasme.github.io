---
title: "Stripe Webhooks Without System Dependencies"
permalink: /stripe-webhooks-without-system-dependencies
date:  2025-04-08 10:30:00 +0200
categories: rails
layout: post
---

Setting up Stripe webhooks in development usually requires installing [Stripe CLI](https://docs.stripe.com/stripe-cli) as a system dependency, authenticating against the right Stripe account and running it in a separate process. But not if you use [`ruby-stripe-cli`](https://github.com/zachasme/ruby-stripe-cli)!

It works by wrapping up the platform-specific Stripe CLI executable, authenticating using your `Stripe.api_key`, and running the `stripe listen` command as a puma plugin.

## Installation

Install the gem and add to the application's Gemfile by executing:

```sh
bundle add ruby-stripe-cli --group development
```

Make sure `Stripe.api_key` is set, e.g. in `config/initializers/stripe.rb`:

```ruby
Stripe.api_key = "sk_test_..." # preferably :dig'ed out of Rails.application.credentials
```

Add `plugin :stripe` to `puma.rb` configuration:

```ruby
# Run stripe cli only in development.
plugin :stripe if ENV["RAILS_ENV"] == "development"
```

By default, events will be forwarded to `/stripe_events`, this can be configured using `stripe_forward_to "/stripe/webhook"` in `puma.rb`.

You can grab your *signing secret* using `StripeCLI.signing_secret`. For example:

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
        StripeCLI.signing_secret(Stripe.api_key)
      )
    rescue => error
      logger.error error
      head :bad_request
    end
end

```

And with that, `bin/setup` will download, authenticate and run Stripe CLI as part of your development server.