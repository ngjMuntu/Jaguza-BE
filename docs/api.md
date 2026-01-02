# Jaguza API Documentation

## Authentication

### Register
`POST /api/auth/register`
- name, email, password

### Login
`POST /api/auth/login`
- email, password

### Verify Email
`GET /api/auth/verify-email/:token`

### Forgot Password
`POST /api/auth/forgot-password`
- email

### Reset Password
`PUT /api/auth/reset-password/:token`
- password

## Products

### List Products
`GET /api/products?search=&category=&page=&limit=`

### Product Detail
`GET /api/products/:slugOrId`

## Categories

### List Categories
`GET /api/categories`

### Category Detail
`GET /api/categories/:slugOrId`

## Cart

### Get Cart
`GET /api/cart`

### Add/Update Cart Item
`POST /api/cart`
- productId, quantity

### Remove Cart Item
`DELETE /api/cart/:itemId`

### Clear Cart
`DELETE /api/cart`

## Orders

### Place Order
`POST /api/orders`
- orderItems, shippingAddress, paymentMethod, itemsPrice, shippingPrice, taxPrice, totalPrice

### My Orders
`GET /api/orders`

### Order Detail
`GET /api/orders/:id`

### Mark as Paid
`PUT /api/orders/:id/pay`
- paymentResult

## Payment

### Create PaymentIntent
`POST /api/payment/create-payment-intent`
- amount, currency

## Wishlist

### Get Wishlist
`GET /api/wishlist`

### Add to Wishlist
`POST /api/wishlist`
- productId

### Remove from Wishlist
`DELETE /api/wishlist/:productId`

### Clear Wishlist
`DELETE /api/wishlist`