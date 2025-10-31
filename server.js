
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const DB_FILE = path.join(__dirname, 'db.json');
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'tu-clave-secreta-debe-ser-larga-y-dificil-de-adivinar';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Servir archivos desde la raíz

// --- Base de Datos ---
let writeLock = Promise.resolve();

async function readDB() {
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    const data = raw.trim() ? JSON.parse(raw) : {};
    return { products: [], rate: 36.5, history: [], users: [], ...data };
  } catch (e) {
    if (e.code === 'ENOENT') return { products: [], rate: 36.5, history: [], users: [] };
    console.error('CRÍTICO: db.json está corrupto.', e);
    process.exit(1);
  }
}

function writeDB(data) {
  writeLock = writeLock.then(() => 
    fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf8')
  ).catch(err => console.error("Error al escribir en db.json:", err));
  return writeLock;
}

const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- Autenticación ---
app.post('/api/register', handle(async (req, res) => {
    const { name, cedula, email, phone, password } = req.body;
    if (!name || !cedula || !email || !phone || !password) {
        return res.status(400).json({ message: 'Todos los campos son requeridos.' });
    }
    const db = await readDB();
    if (db.users.some(u => u.email === email.toLowerCase() || u.cedula === cedula)) {
        return res.status(409).json({ message: 'Ya existe un usuario con esa cédula o correo.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    db.users.push({ id: 'u' + Date.now(), name, cedula, email: email.toLowerCase(), phone, password: hashedPassword });
    await writeDB(db);
    res.status(201).json({ message: '¡Registro exitoso! Ahora puedes iniciar sesión.' });
}));

app.post('/api/login', handle(async (req, res) => {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
        return res.status(400).json({ message: 'La cédula/correo y la contraseña son requeridos.' });
    }
    const db = await readDB();
    const user = db.users.find(u => u.email === identifier.toLowerCase() || u.cedula === identifier);
    if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ message: 'Credenciales incorrectas. Inténtalo de nuevo.' });
    }
    const userPayload = { ...user };
    delete userPayload.password;
    const token = jwt.sign({ id: user.id, cedula: user.cedula }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: userPayload });
}));

// --- API de la Aplicación ---
app.get('/api/products', handle(async (req, res) => res.json((await readDB()).products)));
app.get('/api/rate', handle(async (req, res) => res.json({ rate: (await readDB()).rate })));
app.get('/api/history', handle(async (req, res) => res.json((await readDB()).history)));

app.put('/api/rate', handle(async (req, res) => {
  const db = await readDB();
  const r = Number(req.body.rate);
  if (r > 0) db.rate = r;
  await writeDB(db);
  res.json({ rate: db.rate });
}));

// --- Endpoint de Checkout CORREGIDO ---
app.post('/api/checkout', handle(async (req, res) => {
    const { comprador, items, banco, subtotalUsd, subtotalBs, iva, totalBs } = req.body;

    if (!comprador || !items || !Array.isArray(items) || items.length === 0 || !banco) {
        return res.status(400).json({ message: 'Faltan datos esenciales para procesar el pago.' });
    }

    const nuevaCompra = {
        id: 'TXN-' + Date.now(),
        fecha: new Date().toISOString(),
        comprador: {
            nombre: comprador.nombre || 'N/A',
            cedula: comprador.cedula || 'N/A',
            telefono: comprador.telefono || 'N/A' // Campo de teléfono asegurado
        },
        banco: banco, // Campo de banco asegurado
        items,
        subtotalUsd,
        subtotalBs,
        iva,
        totalBs
    };

    const db = await readDB();
    db.history.push(nuevaCompra);
    await writeDB(db);

    res.status(201).json(nuevaCompra);
}));


// --- Fallback y Errores ---
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use((err, req, res, next) => {
    console.error(`[Error Global] ${req.method} ${req.url}:`, err);
    res.status(500).json({ message: 'Ha ocurrido un error inesperado en el servidor.' });
});

app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
