# Clinifly Admin Panel - Production Deployment Guide

## Overview

This guide covers deploying the Clinifly admin panel to production. The application is a Node.js Express server that serves both API endpoints and static HTML files.

## Prerequisites

- Node.js 18+ installed on the server
- npm or yarn package manager
- Domain name configured (optional but recommended)
- SSL certificate for HTTPS (required for push notifications)
- SMTP credentials for email OTP functionality
- Server with sufficient resources (minimum 1GB RAM, 1 CPU core)

## Step 1: Environment Configuration

Create a `.env` file in the project root with the following variables:

```bash
# Server Configuration
PORT=5050
NODE_ENV=production

# JWT Secret (REQUIRED - Generate a strong random string)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Google Places API (Optional - for location features)
GOOGLE_PLACES_API_KEY=your-google-places-api-key

# SMTP Configuration (Required for OTP emails)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
SMTP_FROM=noreply@clinifly.com

# VAPID Keys for Push Notifications (Optional - will auto-generate if not provided)
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:admin@clinifly.com
```

### Generating Required Secrets

**JWT Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**VAPID Keys (if not provided, will auto-generate on first run):**
```bash
npm install -g web-push
web-push generate-vapid-keys
```

## Step 2: Build and Installation

### 2.1 Install Dependencies

```bash
npm install
```

### 2.2 Verify Installation

```bash
npm start
```

The server should start on port 5050 (or your configured PORT). Test by visiting:
- `http://localhost:5050/admin.html` - Admin dashboard
- `http://localhost:5050/api/admin/clinic` - API endpoint (will require auth)

## Step 3: Production Deployment

### Option A: Using PM2 (Recommended)

**Install PM2:**
```bash
npm install -g pm2
```

**Start the application:**
```bash
pm2 start index.cjs --name clinifly-admin
```

**Configure PM2 to start on system boot:**
```bash
pm2 startup
pm2 save
```

**Useful PM2 commands:**
```bash
pm2 status              # Check status
pm2 logs clinifly-admin # View logs
pm2 restart clinifly-admin # Restart
pm2 stop clinifly-admin   # Stop
```

### Option B: Using systemd (Linux)

Create a systemd service file `/etc/systemd/system/clinifly-admin.service`:

```ini
[Unit]
Description=Clinifly Admin Panel
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/cliniflow-admin
Environment=NODE_ENV=production
EnvironmentFile=/path/to/cliniflow-admin/.env
ExecStart=/usr/bin/node /path/to/cliniflow-admin/index.cjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Enable and start the service:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable clinifly-admin
sudo systemctl start clinifly-admin
sudo systemctl status clinifly-admin
```

### Option C: Using Docker

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 5050

CMD ["node", "index.cjs"]
```

**Build and run:**
```bash
docker build -t clinifly-admin .
docker run -d \
  --name clinifly-admin \
  -p 5050:5050 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  clinifly-admin
```

## Step 4: Reverse Proxy Setup (Nginx)

Configure Nginx as a reverse proxy for HTTPS and domain routing:

**Create `/etc/nginx/sites-available/clinifly-admin`:**

```nginx
server {
    listen 80;
    server_name admin.clinifly.com;  # Replace with your domain
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name admin.clinifly.com;  # Replace with your domain
    
    # SSL Configuration (Let's Encrypt recommended)
    ssl_certificate /etc/letsencrypt/live/admin.clinifly.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.clinifly.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Increase body size for file uploads
    client_max_body_size 50M;
    
    location / {
        proxy_pass http://localhost:5050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # WebSocket support (if needed)
    location /ws {
        proxy_pass http://localhost:5050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**Enable the site:**
```bash
sudo ln -s /etc/nginx/sites-available/clinifly-admin /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Step 5: SSL Certificate (Let's Encrypt)

**Install Certbot:**
```bash
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx
```

**Obtain SSL certificate:**
```bash
sudo certbot --nginx -d admin.clinifly.com
```

**Auto-renewal (already configured by certbot):**
```bash
sudo certbot renew --dry-run
```

## Step 6: Data Directory Setup

Ensure the `data/` directory exists and has proper permissions:

```bash
mkdir -p data/{chats,patients,travel,treatments,uploads/chat,health_forms}
chmod -R 755 data/
```

**Important:** Backup the `data/` directory regularly. This contains all application data.

## Step 7: Firewall Configuration

**UFW (Ubuntu):**
```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

**Note:** The application runs on port 5050 internally. Only expose ports 80/443 through Nginx.

## Step 8: Monitoring and Logs

### Application Logs

**PM2:**
```bash
pm2 logs clinifly-admin
```

**systemd:**
```bash
sudo journalctl -u clinifly-admin -f
```

**Docker:**
```bash
docker logs -f clinifly-admin
```

### Health Check Endpoint

The application doesn't have a dedicated health check endpoint, but you can monitor:
- `GET /api/admin/clinic` (requires auth)
- `GET /admin.html` (should return 200)

## Step 9: Backup Strategy

**Create a backup script `backup.sh`:**

```bash
#!/bin/bash
BACKUP_DIR="/backups/clinifly-admin"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup data directory
tar -czf $BACKUP_DIR/data_$DATE.tar.gz data/

# Backup .env file (if needed)
cp .env $BACKUP_DIR/.env_$DATE

# Keep only last 30 days
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
```

**Schedule with cron:**
```bash
0 2 * * * /path/to/backup.sh
```

## Required Manual Actions

### 1. Domain and DNS Configuration

1. **Purchase/Configure Domain:**
   - Purchase domain (e.g., `clinifly.com`)
   - Create subdomain for admin panel (e.g., `admin.clinifly.com`)

2. **DNS Records:**
   - Add A record: `admin.clinifly.com` → Your server IP address
   - Or CNAME: `admin.clinifly.com` → Your server hostname

3. **Verify DNS:**
   ```bash
   dig admin.clinifly.com
   nslookup admin.clinifly.com
   ```

### 2. Initial Admin Login

1. **Access Admin Panel:**
   - Navigate to `https://admin.clinifly.com/admin-register.html`
   - Or `https://admin.clinifly.com/admin-login.html` if already registered

2. **Register First Clinic:**
   - Fill in clinic registration form
   - Save the admin token securely
   - Use this token for subsequent logins

3. **Verify Access:**
   - Login to admin dashboard
   - Check all sections (Patients, Travel, Treatment, Chat, etc.)

### 3. Email Configuration Verification

1. **Test OTP Email:**
   - Try patient registration with OTP
   - Verify email is received
   - Check SMTP logs if issues occur

2. **Configure Email Templates (if needed):**
   - Modify email content in `index.cjs` (OTP email function)

### 4. Push Notification Setup

1. **Verify VAPID Keys:**
   - Check console logs for VAPID keys on first run
   - Save keys if auto-generated
   - Add to `.env` file for consistency

2. **Test Push Notifications:**
   - Use `/push-notification-example.html` page
   - Verify push notification subscription works
   - Test sending notifications from admin panel

### 5. Security Hardening

1. **Change Default JWT Secret:**
   - Generate new secret (see Step 1)
   - Update `.env` file
   - Restart application

2. **Review File Permissions:**
   ```bash
   chmod 600 .env
   chmod -R 755 data/
   ```

3. **Enable Firewall:**
   - Configure UFW or iptables (see Step 7)

4. **Regular Updates:**
   ```bash
   npm audit
   npm update
   ```

### 6. Performance Optimization

1. **Enable Gzip Compression (Nginx):**
   ```nginx
   gzip on;
   gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
   ```

2. **Configure Caching (Nginx):**
   ```nginx
   location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg)$ {
       expires 1y;
       add_header Cache-Control "public, immutable";
   }
   ```

## Troubleshooting

### Application Won't Start

1. Check Node.js version: `node --version` (should be 18+)
2. Check port availability: `netstat -tulpn | grep 5050`
3. Check logs: `pm2 logs` or `journalctl -u clinifly-admin`
4. Verify `.env` file exists and has correct values

### 502 Bad Gateway

1. Check if application is running: `pm2 status` or `systemctl status clinifly-admin`
2. Check Nginx error logs: `sudo tail -f /var/log/nginx/error.log`
3. Verify proxy_pass URL matches application port

### SSL Certificate Issues

1. Check certificate validity: `sudo certbot certificates`
2. Verify domain DNS: `dig admin.clinifly.com`
3. Check Nginx SSL configuration: `sudo nginx -t`

### Email Not Sending

1. Verify SMTP credentials in `.env`
2. Test SMTP connection: `telnet smtp-relay.brevo.com 587`
3. Check application logs for email errors

### Push Notifications Not Working

1. Verify HTTPS is enabled (required for push notifications)
2. Check VAPID keys in `.env`
3. Verify `web-push` module is installed: `npm list web-push`
4. Check browser console for subscription errors

## Post-Deployment Checklist

- [ ] Domain DNS configured and propagated
- [ ] SSL certificate installed and auto-renewal configured
- [ ] Application running and accessible via domain
- [ ] Admin panel login working
- [ ] All environment variables set correctly
- [ ] Email OTP functionality tested
- [ ] Push notifications tested
- [ ] Backup script configured and tested
- [ ] Monitoring/logging configured
- [ ] Firewall rules configured
- [ ] Security hardening completed
- [ ] Performance optimizations applied

## Support and Maintenance

### Regular Maintenance Tasks

1. **Weekly:**
   - Check application logs for errors
   - Verify backups are running
   - Monitor disk space

2. **Monthly:**
   - Update dependencies: `npm audit` and `npm update`
   - Review security patches
   - Test backup restoration

3. **Quarterly:**
   - Review and update SSL certificates
   - Performance audit
   - Security audit

### Getting Help

- Check application logs first
- Review this deployment guide
- Check GitHub issues (if applicable)
- Contact development team

## Rollback Procedure

If deployment fails:

1. **Stop new version:**
   ```bash
   pm2 stop clinifly-admin
   # or
   sudo systemctl stop clinifly-admin
   ```

2. **Restore previous version:**
   ```bash
   git checkout previous-version-tag
   npm install
   pm2 restart clinifly-admin
   ```

3. **Restore data backup (if needed):**
   ```bash
   tar -xzf /backups/clinifly-admin/data_YYYYMMDD_HHMMSS.tar.gz
   ```

## Additional Notes

- The application stores all data in the `data/` directory (JSON files)
- No database setup required
- Static files are served from the `public/` directory
- API endpoints are defined in `index.cjs`
- Admin panel HTML files are in the `public/` directory

---

**Last Updated:** 2025-01-XX
**Version:** 1.0.0
