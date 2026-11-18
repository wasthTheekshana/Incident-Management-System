# Password policy

How CIMS applies the company password policy. The numbers live in one file, `backend/src/auth/password.policy.ts`, and
the screens read them from `GET /api/auth/password-policy`, so they cannot drift apart.

## Source and the choices made

The policy document lists settings for four places: Active Directory, Oracle ERP, a firewall, and a sample create-user
screen. They do not agree, so CIMS follows the Active Directory settings (the strictest ones that apply to ordinary user
accounts) and the "Password must contain the following" checklist from the sample screen. Anything that passes this
policy also passes the weaker systems' rules.

| Setting | Document value | CIMS |
|---|---|---|
| Minimum length | AD 10, Oracle 8, sample screen 8, firewall 12 | **10** |
| Complexity | AD enabled; sample screen: lowercase, capital, number, special | **All four kinds**, plus no part of the user's name or email |
| Password history | AD: 3 remembered | **Last 3** (the current one and the two before) |
| Maximum age | AD and firewall: 90 days | **90 days**, then a change is forced at the next sign-in |
| Minimum age | AD: 1 day | **1 day** between voluntary changes |
| Account lockout threshold | AD: 3 invalid attempts | **3** |
| Reset the counter after | AD: 5 minutes | **5 minutes** since the last failed attempt |
| Lockout duration | AD: 0 (until an administrator unlocks) | **Until an admin unlocks it** |
| Reversible encryption | AD: disabled | Passwords are hashed with argon2id, never stored reversibly |

Not applied: the firewall's per-class counts (for example 3 special characters) and Oracle's reset timeout. They belong to
those systems. Reset links stay valid for 30 minutes.

## What an admin does

1. **Users, New user.** Type a temporary password, or press **Generate password**, or leave the field empty and the system
   generates one. A typed password has to pass the same checklist as every other password.
2. After **Create user** the temporary password is shown **once** on a green card with a Copy button. It is never stored in
   clear text, so copy it before pressing Done. The same details are also emailed if mail is configured, so a missing mail
   server no longer blocks anyone.
3. **Reset password** works the same way (type, generate, or leave empty) and signs the user out everywhere.
4. A locked account shows a red **Locked** badge and an **Unlock** button. Resetting the password also unlocks it, and so
   does the user's own emailed reset link.

## What the user sees

The first sign-in with a temporary password goes straight to **Change password** and nothing else is reachable until a
new password is set. The screen ticks each rule live. Afterwards the new password counts as the current one, and cannot be
changed again for a day. After 90 days the next sign-in forces a change again.

## Unlocking when nobody can sign in

Lockout lasts until an admin unlocks it, so a locked **only Super Admin** needs a way back. Another Super Admin can use
the Users screen. Otherwise run this on the server:

```
cd ~/ims-stack
docker compose -f docker-compose.prod.yml run --rm api node prisma/unlock.js you@company.com
```

## Things to know

- Anyone can lock someone else's account by entering 3 wrong passwords. That is how the Active Directory policy behaves
  too. Lockouts and unlocks appear in the audit log (`auth.account_locked`, `user.unlocked`), and the sign-in
  rate limit (10 per minute per address) still applies.
- The temporary password is visible to the admin who sets it and, in the API response, only at the moment it is created.
  Hand it over through a safe channel, not over a shared chat.
- Existing accounts keep their current password. Their 90-day clock starts from when this was deployed.
