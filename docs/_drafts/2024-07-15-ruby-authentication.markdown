---
layout: post
title:  "Authentication"
date:   2024-07-15 15:17:52 +0200
categories: rails
---
There is no *best way* to determine *who* a visitor is. You will need to decide between simplicity, flexibility and security.

The basis of HTTP authentication is including **credentials** along with every request.

No matter what stategy you opt for, an attacker with physical access to your computer can extract your session and impersonate you.

## Signed payload
The simplest strategy.

{% highlight ruby %}
def signed_in?
  if user_id = cookies.signed[:user_id]
    Current.user = User.find(user_id)
  end
end

def start_session_for(user)
  cookies.signed.permanent[:user_id] = user.id
  redirect_to root_url
end
{% endhighlight %}

If a session is compromised, your might have to invalidate all sessions.

<h2>Session identifer</h2>
<p>Instead of storing your session payload directly, you can store your sessions in a database and transmit an identifier.</p>

{% highlight ruby %}
User.find(params[:id]).sessions.create!.tap do |session|
  cookies.signed.permanent[:session_id] = session.id
end
{% endhighlight %}

This allows you to invalidate sessions

## Appendix A: (http-only) Cookies vs Local Storage
There is very little difference, and mostly depend on what your stack looks like. A http-only cookie is only accessible by the server, while localstorage is only accessible by javascript (until you send to the server it in a header).

    Cookie: session=<payload>
    Authorization: Bearer <payload>
