# STROOP — Test de Colores y Palabras

Aplicación web profesional para la administración automatizada del **Test de Stroop de Colores y Palabras** (Golden, TEA Ediciones), con generación de informe neuropsicológico en PDF y registro de pacientes.

## 🚀 Características

- **3 condiciones del test** (Palabra, Color, Palabra-Color) con cronómetro de 45 segundos
- **Puntuación automática** con fórmula de Golden (corrección por edad, T scores, percentiles)
- **Informe PDF profesional** con perfil gráfico y interpretación clínica automatizada
- **Historial de pacientes** con búsqueda y acceso a informes pasados
- **Persistencia dual**: localStorage (offline) + Netlify Blobs (online)
- **Interfaz responsive** optimizada para escritorio y tablets

## 📦 Estructura del Proyecto

```
stroop-app/
├── index.html                   # Aplicación SPA
├── styles.css                   # Estilos
├── app.js                       # Controlador principal
├── scoring.js                   # Módulo de puntuación (normas Golden/TEA)
├── report.js                    # Generador de informes PDF
├── netlify/
│   └── functions/
│       └── api.mjs              # API serverless (CRUD pacientes)
├── netlify.toml                 # Configuración Netlify
├── package.json                 # Dependencias
└── README.md
```

## 🖥️ Uso Local (sin servidor)

Simplemente abre `index.html` en tu navegador. La aplicación funciona completamente offline usando localStorage.

> Nota: Las dependencias (Chart.js, jsPDF) se cargan desde CDN, por lo que necesitas conexión a internet en la primera carga.

## ☁️ Despliegue en Netlify

### 1. Instalar dependencias
```bash
npm install
```

### 2. Conectar con Netlify
```bash
# Instalar Netlify CLI (si no lo tienes)
npm install -g netlify-cli

# Login en Netlify
netlify login

# Inicializar sitio
netlify init

# Desplegar
netlify deploy --prod
```

### 3. Variables de entorno
No se requieren variables de entorno adicionales. Netlify Blobs funciona automáticamente.

## 🧪 Test de Stroop — Resumen Clínico

| Condición | Estímulo | Respuesta | Mide |
|-----------|----------|-----------|------|
| **P (Palabra)** | Palabras en negro | Leer la palabra | Velocidad lectora |
| **C (Color)** | "XXXX" en color | Nombrar el color | Velocidad perceptiva |
| **PC (Interferencia)** | Palabra en color incongruente | Nombrar el color de tinta | Control inhibitorio |

### Fórmula de Interferencia (Golden)
```
PC' = (P × C) / (P + C)
Interferencia = PC - PC'
```

## 📄 Licencia

Herramienta clínica de uso profesional. El Test de Stroop es propiedad intelectual de TEA Ediciones.
