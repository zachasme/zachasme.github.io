---
title: "Rails & Cloudflare IP Country"
permalink: /cloudflare-ip-country
date:  2025-03-07 14:11:00 +0200
categories: rails
layout: post
---

When using Cloudflare DNS with proxying enabled, Cloudflare will enrich requests with the country code corresponding to the requesting ip address:

```ruby
request.headers["CF-IPCountry"]
```

Sadly this *will not work in development*. Instead, we can "fake" it using a Rack middleware that asks Cloudflare for the country of the development machine itself:

```ruby
# lib/middleware/cloudflare_ip_country_faker.rb
class CloudflareIpCountryFaker
  # For use in development, will pretend to be behind cloudflare
  # using ip and country of the development machine as seen by CF
  def initialize(app)
    @app = app
    response = Net::HTTP.get("cloudflare.com", "/cdn-cgi/trace")
    @trace = Hash[response.scan(/(.*)=(.*)/)]
  end

  def call(env)
    env["HTTP_X_FORWARDED_FOR"] = @trace["ip"]
    env["HTTP_CF_IPCOUNTRY"] = @trace["loc"]
    @app.call(env)
  end
end
```

Make sure to insert the middleware in your development environment:

```ruby
# config/environments/development.rb
require "middleware/cloudflare_ip_country_faker"

Rails.application.configure do
  # ...
  config.middleware.insert_before ActionDispatch::RemoteIp, CloudflareIpCountryFaker
  Rails.backtrace_cleaner.add_silencer { |line| line =~ /lib\/middleware/ }
  # ...
end
```

We've added our middleware to the `Rails.backtrace_cleaner` silencer list, otherwise application errors might show up as originating from the middleware.

You should also add the middleware directory to your autolib ignore list:

```ruby
# config/application.rb
config.autoload_lib(ignore: %w[assets tasks middleware])
```

And with that we can rely on the IP country header in both development and production!
