# FormCraft — Deployment Guide

This guide covers deploying FormCraft to production environments including Vercel, Docker, and self-hosted Linux servers.

---

## 1. Production Requirements

- **Runtime**: Node.js 18+ (Node 20 LTS or Node 24 recommended)
- **Database**: Managed PostgreSQL instance (Supabase, Neon, AWS RDS, DigitalOcean, or self-hosted)
- **Memory**: Minimum 512MB RAM (1GB+ recommended for production workloads)

---

## 2. Environment Variables

Set the following variables in your production environment:

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@ep-cool-db.us-east-2.aws.neon.tech/formcraft?sslmode=require` |
| `JWT_SECRET` | Cryptographically random secret string | `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | Canonical public domain | `https://forms.yourdomain.com` |
| `NODE_ENV` | Environment mode | `production` |

---

## 3. Deploying to Vercel

1. Push your repository to GitHub, GitLab, or Bitbucket.
2. Log in to [Vercel](https://vercel.com) and click **Add New Project**.
3. Import your FormCraft repository.
4. Set the Framework Preset to **Next.js**.
5. Add your Environment Variables:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `NEXT_PUBLIC_APP_URL`
6. In **Build & Development Settings**, set the Build Command:
   ```bash
   npx prisma generate && next build
   ```
7. Click **Deploy**.
8. After deployment, run database migrations or initial seeding:
   ```bash
   npx prisma db push
   npx tsx prisma/seed.ts
   ```

---

## 4. Deploying with Docker

### `Dockerfile`
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
CMD ["npm", "start"]
```

### Build & Run
```bash
docker build -t formcraft:latest .
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:password@host:5432/formcraft" \
  -e JWT_SECRET="your-secret" \
  formcraft:latest
```

---

## 5. Self-Hosted VPS (Ubuntu / Debian with PM2 & Nginx)

1. **Clone repository**:
   ```bash
   git clone https://github.com/your-org/formcraft.git /var/www/formcraft
   cd /var/www/formcraft
   ```
2. **Install dependencies and build**:
   ```bash
   npm install --legacy-peer-deps
   npx prisma generate
   npx prisma db push
   npx tsx prisma/seed.ts
   npm run build
   ```
3. **Start with PM2**:
   ```bash
   npm install -g pm2
   pm2 start npm --name "formcraft" -- start
   pm2 save
   pm2 startup
   ```
4. **Configure Nginx Reverse Proxy**:
   ```nginx
   server {
       listen 80;
       server_name forms.example.com;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
5. Secure with Let's Encrypt SSL:
   ```bash
   sudo certbot --nginx -d forms.example.com
   ```
