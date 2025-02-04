---
layout: post
title:  "Rails & Stripe"
date:   2024-01-28 19:42:00 +0200
categories: rails
---

Draft:
- write up most basic integration
- then take each problem with stripe and slowly add complexity to solve problems

Problems:

- Stripe doesn’t guarantee delivery of events in the order in which they’re generated
> https://docs.stripe.com/webhooks#event-ordering

- Webhook endpoints might occasionally receive the same event more than once
> https://docs.stripe.com/webhooks#handle-duplicate-events

## Initial implementation

Let's say you have a 

```ruby
# app/models/user.rb
class User < ApplicationRecord
  validates :stripe_customer_id, uniqueness: true
  validates :total_paid, presence: true, comparison: { greater_than_or_equal_to: 0 }
end

# config/routes.rb
Rails.application.routes.draw do
  # ...
  resource :stripe_event, only: :create
end

# app/controllers/stripe_events_controller.rb
class StripeEventsController < ApplicationController
  protect_from_forgery except: :create

  before_action :set_event

  def create
    object = @event.data.object
    case @event.type
    when 'customer.subscription.created'
      User.create(stripe_customer_id: object.customer, total_paid: 0)
    when 'invoice.paid'
      User
        .find_by(stripe_customer_id: object.customer)
        .increment(:total_paid, by: object.amount_paid)
    end

    head :ok
  end

  private

    def set_event
      payload = request.body.read
      signature = request.headers["stripe-signature"]
      secret = Rails.configuration.stripe_signing_secret
      @event = Stripe::Webhook.construct_event(payload, signature, secret)
    rescue Stripe::SignatureVerificationError
      head :bad_request
    end
end
```

## Second iteration
Stripe doesn’t guarantee delivery of events in the order in which they’re generated
> https://docs.stripe.com/webhooks#event-ordering

```ruby
class StripeEventsController < ApplicationController
  # ...

  def create
    case @event.type
    when 'customer.subscription.created'
      Subscription.retrieve_from_stripe(@event.data.object.id)
    when 'invoice.paid'
      Subscription.retrieve_from_stripe(@event.data.object.subscription)
    end

    head :ok
  end

  # ...
end

class Subscription < ApplicationRecord
  def self.retrieve_from_stripe(id)
    stripe = Stripe::Subscription.retrieve(id)
    total_paid = 0
    Stripe::Invoice.list(subscription: id).auto_paging_each do |invoice|
      total_paid += invoice.amount_paid
    end
    subscription = find_or_initialize_by(stripe_id: id)
    subscription.update!(total_paid: payments)
  end
end
```

## Third iteration
- Webhook endpoints might occasionally receive the same event more than once
> https://docs.stripe.com/webhooks#handle-duplicate-events

```ruby
class StripeEventsController < ApplicationController
  # ...

  def create
    StripeEvent.create(
      stripe_id: @event.id,
      payload: @event
    ).process_later

    head :ok
  end

  # ...
end

class StripeEvent < ApplicationRecord
  def process_later
    StripeEvent::ProcessJob.perform_later(self)
  end

  def process_now
    event = Stripe::Event.construct_from(JSON.parse(payload))
    case event.type
    when 'customer.subscription.created'
      Subscription.retrieve_from_stripe(event.data.object.id)
    when 'invoice.paid'
      Subscription.retrieve_from_stripe(event.data.object.subscription)
    end
  end
end

class StripeEvent::ProcessJob < ApplicationJob
  def perform(event)
    event.process_now
  end
end

```

## Testing

Using VCR and Webmock

```ruby
# test/test_helper.rb
ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"
require "test_helpers/stripe_test_helper"
require "test_helpers/vcr_test_helper"

VCR.configure do |config|
  config.cassette_library_dir = "test/vcr_cassettes"
  config.hook_into :webmock
end

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    # Add more helper methods to be used by all tests here...
    include StripeTestHelper, VcrTestHelper
  end
end

# test/test_helpers/vcr_test_helper.rb
# https://www.youtube.com/watch?v=j0FDwx4P-WU
module VcrTestHelper
  def use_test_named_casette(**vcr_options)
    if ENV["VCR_REFRESH"]
      puts "Refreshing VCR casette #{vcr_filename}"
      vcr_options[:record] = :all
    else
      vcr_options[:record] = :new_episodes
    end

    VCR.use_cassette(vcr_filename, **vcr_options) do |casette|
      yield casette
    end
  end

  def vcr_recorded_at
    VCR.current_cassette&.originally_recorded_at || Time.now
  end

  def sleep_if_creating_vcr_casette(seconds: 5)
    sleep(seconds) if VCR.current_cassette.recording?
  end

  private

    def vcr_filename
      test_description = name.delete_prefix("test_")

      "#{vcr_prefix}#{test_description}".parameterize
    end

    def vcr_prefix
      prefix = self.class.name.delete_suffix("Test")

      "#{prefix}__"
    end
end

# test/test_helpers/stripe_test_helper.rb
module StripeTestHelper
  def reset_test_clock(to: Time.current)
    @test_clock = Stripe::TestHelpers::TestClock.create(frozen_time: to.to_i)
  end

  def advance_test_clock(to:)
    @test_clock = Stripe::TestHelpers::TestClock.advance(@test_clock.id, frozen_time: to.to_i)
    while @test_clock.status != "ready"
      sleep_if_creating_vcr_casette
      @test_clock = Stripe::TestHelpers::TestClock.retrieve(@test_clock.id)
    end
  end
end
```