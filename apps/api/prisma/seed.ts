import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create demo store
  const store = await prisma.store.upsert({
    where: { id: 'demo-store-id-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'demo-store-id-0000-0000-000000000001',
      name: 'Ferretería Demo',
      plan: 'pro',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  // Create admin user
  const passwordHash = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: {
      storeId_email: {
        storeId: store.id,
        email: 'admin@demo.com',
      },
    },
    update: {},
    create: {
      storeId: store.id,
      email: 'admin@demo.com',
      passwordHash,
      name: 'Administrador',
      role: 'admin',
    },
  });

  // Create cashier user
  const cashierHash = await bcrypt.hash('cajero123', 12);
  await prisma.user.upsert({
    where: {
      storeId_email: {
        storeId: store.id,
        email: 'cajero@demo.com',
      },
    },
    update: {},
    create: {
      storeId: store.id,
      email: 'cajero@demo.com',
      passwordHash: cashierHash,
      name: 'Juan Cajero',
      role: 'cashier',
    },
  });

  // Create categories
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { storeId_name: { storeId: store.id, name: 'Herramientas' } },
      update: {},
      create: { storeId: store.id, name: 'Herramientas' },
    }),
    prisma.category.upsert({
      where: { storeId_name: { storeId: store.id, name: 'Electricidad' } },
      update: {},
      create: { storeId: store.id, name: 'Electricidad' },
    }),
    prisma.category.upsert({
      where: { storeId_name: { storeId: store.id, name: 'Plomería' } },
      update: {},
      create: { storeId: store.id, name: 'Plomería' },
    }),
    prisma.category.upsert({
      where: { storeId_name: { storeId: store.id, name: 'Pinturas' } },
      update: {},
      create: { storeId: store.id, name: 'Pinturas' },
    }),
    prisma.category.upsert({
      where: { storeId_name: { storeId: store.id, name: 'Tornillería' } },
      update: {},
      create: { storeId: store.id, name: 'Tornillería' },
    }),
  ]);

  // Create sample products
  const products = [
    { name: 'Martillo 16oz', barcode: '7890001', price: 12500, cost: 8000, stock: 25, minStock: 5, categoryId: categories[0].id, unit: 'unidad' },
    { name: 'Destornillador Phillips #2', barcode: '7890002', price: 4500, cost: 2800, stock: 40, minStock: 10, categoryId: categories[0].id, unit: 'unidad' },
    { name: 'Taladro 3/8" Eléctrico', barcode: '7890003', price: 85000, cost: 55000, stock: 8, minStock: 3, categoryId: categories[0].id, unit: 'unidad' },
    { name: 'Llave Inglesa 12"', barcode: '7890004', price: 18000, cost: 11000, stock: 15, minStock: 5, categoryId: categories[0].id, unit: 'unidad' },
    { name: 'Cable Eléctrico 2.5mm x metro', barcode: '7890005', price: 1200, cost: 700, stock: 200, minStock: 50, categoryId: categories[1].id, unit: 'metro' },
    { name: 'Tomacorriente Doble', barcode: '7890006', price: 3500, cost: 2000, stock: 60, minStock: 20, categoryId: categories[1].id, unit: 'unidad' },
    { name: 'Disyuntor 20A', barcode: '7890007', price: 8500, cost: 5000, stock: 30, minStock: 10, categoryId: categories[1].id, unit: 'unidad' },
    { name: 'Cinta Aisladora 18mm', barcode: '7890008', price: 950, cost: 500, stock: 4, minStock: 20, categoryId: categories[1].id, unit: 'unidad' },
    { name: 'Caño PVC 110mm x 3m', barcode: '7890009', price: 6500, cost: 4000, stock: 35, minStock: 10, categoryId: categories[2].id, unit: 'unidad' },
    { name: 'Llave de Paso 1/2"', barcode: '7890010', price: 4200, cost: 2500, stock: 22, minStock: 8, categoryId: categories[2].id, unit: 'unidad' },
    { name: 'Pintura Látex Blanco 4L', barcode: '7890011', price: 22000, cost: 14000, stock: 12, minStock: 5, categoryId: categories[3].id, unit: 'litro' },
    { name: 'Rodillo Pintura 22cm', barcode: '7890012', price: 3800, cost: 2200, stock: 18, minStock: 8, categoryId: categories[3].id, unit: 'unidad' },
    { name: 'Tornillo 3/8" x 2" (caja x50)', barcode: '7890013', price: 1800, cost: 900, stock: 100, minStock: 30, categoryId: categories[4].id, unit: 'caja' },
    { name: 'Perno Hex M10 x 50mm', barcode: '7890014', price: 350, cost: 180, stock: 3, minStock: 50, categoryId: categories[4].id, unit: 'unidad' },
    { name: 'Sierra Circular 7 1/4"', barcode: '7890015', price: 125000, cost: 82000, stock: 5, minStock: 2, categoryId: categories[0].id, unit: 'unidad' },
  ];

  for (const p of products) {
    const existing = await prisma.product.findFirst({
      where: { storeId: store.id, barcode: p.barcode },
    });
    if (!existing) {
      await prisma.product.create({
        data: {
          storeId: store.id,
          categoryId: p.categoryId,
          name: p.name,
          barcode: p.barcode,
          price: p.price,
          cost: p.cost,
          stock: p.stock,
          minStock: p.minStock,
          unit: p.unit,
        },
      });
    }
  }

  console.log('✅ Seed completed!');
  console.log(`\n📋 Demo credentials:`);
  console.log(`   Admin:  admin@demo.com / admin123`);
  console.log(`   Cajero: cajero@demo.com / cajero123`);
  console.log(`   Store:  ${store.name} (${store.id})`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
