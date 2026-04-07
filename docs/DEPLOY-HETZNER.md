# Deploy en Hetzner VPS — FerretPOS

> Guía paso a paso para poner FerretPOS en producción en un VPS de Hetzner.
> Tiempo estimado: 30-45 minutos la primera vez.

---

## 1. Crear el VPS en Hetzner

1. Ir a [console.hetzner.cloud](https://console.hetzner.cloud)
2. Crear servidor:
   - **Tipo:** CX22 (2 vCPU, 4 GB RAM) — €4.35/mes
   - **Imagen:** Ubuntu 24.04
   - **Ubicación:** Ashburn o Nuremberg (según público)
   - **SSH Key:** Agregar tu clave pública SSH
   - **Networking:** IPv4 habilitado
3. Anotar la IP del servidor

---

## 2. Configuración inicial del servidor

```bash
# Conectarse
ssh root@TU_IP_HETZNER

# Actualizar sistema
apt update && apt upgrade -y

# Instalar dependencias base
apt install -y curl git nginx certbot python3-certbot-nginx ufw

# Firewall básico
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable

# Instalar Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Instalar pnpm
npm install -g pnpm

# Instalar PM2 (process manager)
npm install -g pm2

# Instalar Docker (para PostgreSQL)
curl -fsSL https://get.docker.com | sh
systemctl enable docker
```

---

## 3. Clonar y configurar el proyecto

```bash
# Clonar repositorio
git clone https://github.com/DiegoTorus/TEST.git /opt/ferretpos
cd /opt/ferretpos

# Instalar dependencias
pnpm install

# Levantar PostgreSQL con Docker
docker-compose up -d

# Esperar 5 segundos a que PostgreSQL arranque
sleep 5

# Configurar variables de entorno
cp .env.example apps/api/.env
```

### Editar variables de entorno

```bash
nano apps/api/.env
```

Contenido (cambiar los secrets):

```env
DATABASE_URL="postgresql://pos_user:pos_password@localhost:5432/ferreteria_pos"
JWT_ACCESS_SECRET="CAMBIAR_genera_con_openssl_rand_hex_32"
JWT_REFRESH_SECRET="CAMBIAR_genera_con_openssl_rand_hex_32_otro"
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://tudominio.com
```

Para generar secrets aleatorios:

```bash
openssl rand -hex 32   # copiar y pegar como JWT_ACCESS_SECRET
openssl rand -hex 32   # copiar y pegar como JWT_REFRESH_SECRET
```

---

## 4. Migrar BD y cargar datos

```bash
cd /opt/ferretpos

# Generar cliente Prisma
pnpm --filter api exec prisma generate

# Crear tablas
pnpm --filter api exec prisma migrate dev --name init

# Cargar datos de ejemplo
pnpm db:seed
```

---

## 5. Build del frontend

```bash
cd /opt/ferretpos

# Crear archivo de env para el frontend
echo 'VITE_API_URL=https://tudominio.com' > apps/web/.env.production

# Build
pnpm --filter web build

# Los archivos estáticos quedan en apps/web/dist/
```

---

## 6. Configurar PM2 (mantener API corriendo)

```bash
cd /opt/ferretpos

# Crear archivo de configuración PM2
cat > ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'ferretpos-api',
    cwd: '/opt/ferretpos',
    script: 'node_modules/.bin/tsx',
    args: 'apps/api/src/server.ts',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '500M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
EOF

# Iniciar la API
pm2 start ecosystem.config.cjs

# Verificar que funciona
pm2 status
curl http://localhost:3001/health
# Debe responder: {"status":"ok","timestamp":"..."}

# Guardar configuración PM2 (auto-arranque en reboot)
pm2 startup
pm2 save
```

---

## 7. Configurar Nginx

```bash
# Crear configuración
cat > /etc/nginx/sites-available/ferretpos << 'NGINX'
server {
    listen 80;
    server_name tudominio.com www.tudominio.com;

    # Frontend — archivos estáticos (React build)
    root /opt/ferretpos/apps/web/dist;
    index index.html;

    # SPA fallback — todas las rutas van a index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API — proxy al backend Fastify
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:3001;
    }

    # Cache assets estáticos (JS, CSS, imágenes) — 1 año
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # PWA manifest y service worker — sin cache largo
    location ~* (manifest\.webmanifest|sw\.js)$ {
        expires 0;
        add_header Cache-Control "no-cache";
        try_files $uri =404;
    }

    # Seguridad headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
    gzip_min_length 1000;
}
NGINX

# Activar sitio
ln -sf /etc/nginx/sites-available/ferretpos /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Verificar configuración
nginx -t

# Reiniciar Nginx
systemctl restart nginx
```

---

## 8. SSL con Let's Encrypt (HTTPS gratis)

```bash
# Antes: apuntar dominio a la IP del VPS en tu registrador DNS
# Registro A: tudominio.com → TU_IP_HETZNER
# Registro A: www.tudominio.com → TU_IP_HETZNER

# Obtener certificado SSL (automático)
certbot --nginx -d tudominio.com -d www.tudominio.com

# Certbot modifica Nginx automáticamente para HTTPS
# Renovación automática ya queda configurada (cron de certbot)

# Verificar
curl https://tudominio.com/health
```

---

## 9. Backup automático

```bash
# Crear directorio de backups
mkdir -p /opt/backups

# Crear script de backup
cat > /opt/ferretpos/backup.sh << 'EOF'
#!/bin/bash
set -e
BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M)
CONTAINER=$(docker ps -q -f name=postgres)

# Backup PostgreSQL
docker exec $CONTAINER pg_dump -U pos_user ferreteria_pos | gzip > "$BACKUP_DIR/ferretpos-$DATE.sql.gz"

# Mantener solo últimos 30 días
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "[$DATE] Backup completado: ferretpos-$DATE.sql.gz"
EOF

chmod +x /opt/ferretpos/backup.sh

# Programar backup diario a las 3:00 AM
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/ferretpos/backup.sh >> /var/log/ferretpos-backup.log 2>&1") | crontab -

# Probar que funciona
/opt/ferretpos/backup.sh
ls -lh /opt/backups/
```

---

## 10. Script de actualización

Crear un script para actualizar fácilmente:

```bash
cat > /opt/ferretpos/update.sh << 'EOF'
#!/bin/bash
set -e
cd /opt/ferretpos

echo "🔄 Actualizando FerretPOS..."

# 1. Backup antes de actualizar
./backup.sh

# 2. Descargar cambios
git pull origin claude/offline-pos-system-Uq0kh

# 3. Instalar dependencias nuevas
pnpm install

# 4. Generar Prisma Client
pnpm --filter api exec prisma generate

# 5. Aplicar migraciones de BD
pnpm --filter api exec prisma migrate deploy

# 6. Rebuild frontend
pnpm --filter web build

# 7. Reiniciar API
pm2 restart ferretpos-api

echo "✅ Actualización completada"
echo "🔍 Verificando..."
sleep 2
curl -s http://localhost:3001/health
echo ""
pm2 status
EOF

chmod +x /opt/ferretpos/update.sh
```

Uso:

```bash
ssh root@TU_IP && /opt/ferretpos/update.sh
```

---

## 11. Monitoreo básico

```bash
# Ver logs de la API en tiempo real
pm2 logs ferretpos-api

# Ver estado de todos los procesos
pm2 status

# Ver uso de recursos
pm2 monit

# Ver estado de PostgreSQL
docker ps
docker logs $(docker ps -q -f name=postgres) --tail 20

# Ver estado de Nginx
systemctl status nginx

# Ver espacio en disco
df -h

# Ver uso de memoria
free -h
```

---

## 12. Restaurar backup (en caso de emergencia)

```bash
# Listar backups disponibles
ls -lh /opt/backups/

# Restaurar un backup específico
BACKUP_FILE="/opt/backups/ferretpos-20260329_0300.sql.gz"
CONTAINER=$(docker ps -q -f name=postgres)

# Parar la API temporalmente
pm2 stop ferretpos-api

# Restaurar
gunzip -c $BACKUP_FILE | docker exec -i $CONTAINER psql -U pos_user -d ferreteria_pos

# Reiniciar API
pm2 restart ferretpos-api
```

---

## Checklist de verificación post-deploy

```
[ ] https://tudominio.com carga la página de login
[ ] Login con admin@demo.com / admin123 funciona
[ ] Crear una venta de prueba funciona
[ ] Abrir/cerrar caja funciona
[ ] https://tudominio.com/health responde {"status":"ok"}
[ ] Certificado SSL válido (candado verde en navegador)
[ ] PM2 muestra status "online" para ferretpos-api
[ ] Backup cron programado (crontab -l para verificar)
[ ] Instalar PWA desde Chrome funciona (ícono en escritorio)
[ ] Desconectar WiFi → la app sigue funcionando
```

---

## Troubleshooting

| Problema | Solución |
|----------|---------|
| API no arranca | `pm2 logs ferretpos-api --lines 50` para ver el error |
| Error de BD | `docker ps` verificar que PostgreSQL está corriendo |
| 502 Bad Gateway | API no está corriendo. `pm2 restart ferretpos-api` |
| SSL no funciona | Verificar DNS apunta a la IP. `certbot renew --dry-run` |
| Disco lleno | `docker system prune -a` + limpiar backups viejos |
| RAM agotada | `pm2 restart all` + verificar con `htop` |
| Actualización falla | El backup se hizo antes. Restaurar y revisar logs |
