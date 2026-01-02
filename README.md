# Jaguza Backend API

Unified backend API serving both the client storefront and admin dashboard.

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐
│  Client Frontend    │     │  Admin Dashboard    │
│  (Public Store)     │     │  (Private)          │
│  ../client_frontend │     │  ../admin_dashboard │
└─────────┬───────────┘     └─────────┬───────────┘
          │                           │
          └───────────┬───────────────┘
                      ▼
            ┌─────────────────┐
            │  Backend API    │
            │  Port 4000      │
            │                 │
            │  /api/*         │  ◀── Client routes
            │  /api/admin/*   │  ◀── Admin routes (secured)
            │  /webhook/*     │  ◀── Payment webhooks
            └─────────────────┘
```

## Features

- User authentication (JWT, email verification, password reset)
- Product & category browsing (with caching)
- Cart & wishlist (per-user, persistent)
- Order placement, payment (Stripe), and email notifications
- File upload (product images)
- Logging (access/error), in-memory caching, validation

## Setup

1. **Clone the repo**  
   `git clone ...`

2. **Install dependencies**  
   `cd backend && npm install`

3. **Configure environment**  
   Copy `.env.example` to `.env` and fill in your values.

4. **Start the server**  
   `npm run dev`

## Environment variables

Copy `.env.example` to `.env` and fill in values:

- NODE_ENV, PORT
- CORS_ORIGINS: comma separated list of allowed origins
- MONGO_URI: Atlas connection string (use a dedicated user). Restrict IPs in Atlas.
- JWT_SECRET, JWT_EXPIRES_IN
- CLIENT_URL
- EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS (use provider app passwords)
- STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

Never commit `.env`. Configure the same values in your hosting provider/CI.

## Stripe webhook setup

1. In Stripe Dashboard > Developers > Webhooks, create an endpoint:
   - URL: `https://your-api-domain.com/webhook/stripe`
   - Events: at least `payment_intent.succeeded` (add others as needed)
2. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
3. For local testing, use Stripe CLI:
   - `stripe listen --forward-to localhost:5000/webhook/stripe`
   - Use the CLI-provided signing secret as `STRIPE_WEBHOOK_SECRET`.

## Rotate MongoDB credentials

1. Create a new DB user in Atlas with strong password and least privileges.
2. Update `MONGO_URI` across environments to use the new user.
3. Remove the old DB user and restrict Network Access to known IPs.

## Folder Structure

- `controllers/` — Business logic for each resource
- `models/` — Mongoose schemas
- `routes/` — Express routers
- `middleware/` — Auth, validation, upload, role, cache
- `utils/` — Email, payment, helpers
- `config/` — DB and email config
- `logging/` — Access/error logs
- `cache/` — Node-cache config
- `uploads/` — Uploaded files

## API Endpoints

- `/api/auth` — Register, login, verify, reset, profile
- `/api/categories` — List, detail
- `/api/products` — List, detail, search, filter
- `/api/cart` — Get, add, remove, clear
- `/api/wishlist` — Get, add, remove, clear
- `/api/orders` — Place, list, detail, pay
- `/api/payment` — Stripe PaymentIntent

## Production

- Use HTTPS and secure cookies in production.
- Set strong secrets in `.env`.
- Use a real SMTP server for email.
- Use a production MongoDB instance.

## License

MIT# Jaguza-BE
