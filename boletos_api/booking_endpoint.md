# 📘 Endpoint: `/booking` — Guía de Uso

**Producción:** `https://boleto-services.opencars.com.ar/pat/booking`

**Local:** `http://localhost:4000/pat/booking`

Este endpoint permite obtener boletos aplicando filtros opcionales como tipo de venta, año, mes o rango de fechas. También soporta paginación.

---

## 🔐 Autenticación

Este endpoint requiere autenticación mediante **Personal Access Token (PAT)** usando el esquema Bearer Token.

### Configuración

El PAT debe configurarse como variable de entorno `BOLETOS_PAT` en el backend:

```bash
BOLETOS_PAT=tu_token_aqui
```

### Uso en solicitudes

Todas las solicitudes deben incluir el header de autorización:

```
Authorization: Bearer {BOLETOS_PAT}
```

**Ejemplo con cURL:**
```bash
curl -X GET "https://boleto-services.opencars.com.ar/pat/booking?year=2024" \
  -H "Authorization: Bearer tu_token_aqui" \
  -H "Content-Type: application/json"
```

**Ejemplo con JavaScript (axios):**
```javascript
const response = await axios.get('https://boleto-services.opencars.com.ar/pat/booking', {
  params: { year: 2024 },
  headers: {
    'Authorization': `Bearer ${BOLETOS_PAT}`,
    'Content-Type': 'application/json'
  }
});
```

### Errores de autenticación

Si el token es inválido o ha sido revocado, el endpoint devolverá:

```json
{
  "error": "Invalid token or revoked token"
}
```

Con código de estado HTTP `401 Unauthorized`.

---

## 🧩 Parámetros disponibles

| Parámetro    | Tipo   | Descripción                                     | Opciones                                               |
| ------------ | ------ | ----------------------------------------------- | ------------------------------------------------------ |
| `typeOfSale` | string | Filtra por tipo de venta                        | VN, VO, VE o PL, PEDIDO, ADJ, SDA, COMPRA, COMPRAUSADO |
| `year`       | number | Filtra por año                                  |                                                        |
| `month`      | number | Filtra por mes (requiere `year`)                |                                                        |
| `startDate`  | string | Fecha inicial (YYYY-MM-DD)                      |                                                        |
| `endDate`    | string | Fecha final (YYYY-MM-DD)                        |                                                        |
| `page`       | number | Número de página (activa la paginación)         |                                                        |
| `limit`      | number | Cantidad por página (solo válido si hay `page`) |                                                        |

---

## 📦 Formato de la respuesta

El servidor puede devolver:

- Un **array** de boletos directamente, o
- Un objeto con **`bookings`** (array) o **`data`** (array), o
- Un **único objeto** boleto.

OC Servicios normaliza eso en `backend/services/boletosService.js` al sincronizar.

### Claves de primer nivel (muestra en vivo)

Generado con `node backend/scripts/fetch-booking-sample.mjs` (requiere `BOLETOS_PAT` en `backend/.env`). Sobre una página de resultados `VN`, las claves observadas en **todos** los ítems de la muestra fueron:

| Clave | Tipo (resumen) |
| ----- | -------------- |
| `_id` | string (ObjectId en hex) |
| `ownerIds` | array de objetos (titular) |
| `vehicleId` | objeto (vehículo) |
| `salesConsultant` | string |
| `status` | string (estado del boleto en origen) |
| `origen` | objeto (taller / ubicación) |
| `typeOfSale` | string (ej. `VN`) |
| `createdAt` | string (fecha/hora creación) |
| `ref` | string *(no en todos los registros; aparece en algunos ítems del mismo lote)* |

### Estructura anidada típica

**`ownerIds[]`** (primer elemento):

- `_id`, `Name`, `LastName`, `CuilCuit`, `Email`, `Tel`

**`vehicleId`**:

- `_id`, `Brand`, `Model`, `Domain`, `ChassisNumber`

**`origen`**:

- `_id`, `city`, `province`, `brand`, `company`, `address`, `boss`, `createdAt`, `updatedAt`, `__v`

### Identificador para integraciones

Para unificar con Mongo, el backend acepta como ID de boleto: `id`, `_id` o `bookingId` si el API los envía. En la muestra anterior predominaba **`_id`** como string.

### Actualizar esta lista

Si el API agrega campos, volvé a ejecutar:

```bash
cd backend
node scripts/fetch-booking-sample.mjs
```

El script imprime JSON con la unión de claves de primer nivel y una descripción superficial de objetos anidados.

---

## 📏 Reglas importantes

1. Podés usar:

   - `year`
   - `year` + `month`
   - `startDate` y/o `endDate`

2. **No podés mezclar:**

   - (`year` o `month`) con (`startDate` o `endDate`)

3. `month` **solo funciona si también enviás `year`.**

4. **Paginación:**

   - Si enviás `page`, la paginación se activa.
   - Si enviás `limit`, debe haber `page`, si no → error.
   - Si no enviás `page`, el endpoint trae _todos_ los resultados sin paginar.

5. **Fechas:**
   - Solo `startDate` → desde esa fecha hasta **hoy**.
   - Solo `endDate` → desde 1970 hasta esa fecha.
   - Ambos → rango entre `startDate` y `endDate` (incluye el día completo de `endDate`).

---

# ✅ Casos de uso recomendados

## 1️⃣ Obtener todos los boletos

| Descripción                      | Ejemplo                    |
| -------------------------------- | -------------------------- |
| Todos los boletos                | `/booking`                 |
| Paginar (página 1)               | `/booking?page=1`          |
| Paginar con límite personalizado | `/booking?page=1&limit=50` |

---

## 2️⃣ Filtrar por tipo de venta

| Descripción                | Ejemplo                                  |
| -------------------------- | ---------------------------------------- |
| Solo tipo de venta         | `/booking?typeOfSale=VN`                 |
| Tipo de venta + paginación | `/booking?typeOfSale=VN&page=1`          |
| Tipo de venta + límite     | `/booking?typeOfSale=VN&page=1&limit=20` |

---

## 3️⃣ Filtrar por año

| Descripción         | Ejemplo                              |
| ------------------- | ------------------------------------ |
| Año específico      | `/booking?year=2024`                 |
| Año + paginación    | `/booking?year=2024&page=1`          |
| Año + límite        | `/booking?year=2024&page=1&limit=30` |
| Año + tipo de venta | `/booking?year=2024&typeOfSale=VN`   |

---

## 4️⃣ Filtrar por año y mes

| Descripción               | Ejemplo                                    |
| ------------------------- | ------------------------------------------ |
| Mayo 2024                 | `/booking?year=2024&month=5`               |
| Mayo 2024 + paginación    | `/booking?year=2024&month=5&page=1`        |
| Mayo 2024 + tipo de venta | `/booking?year=2024&month=5&typeOfSale=VN` |

---

## 5️⃣ Filtrar desde una fecha (startDate → hoy)

| Descripción             | Ejemplo                                       |
| ----------------------- | --------------------------------------------- |
| Desde X fecha hasta hoy | `/booking?startDate=2024-01-01`               |
| Con paginación          | `/booking?startDate=2024-01-01&page=1`        |
| Con tipo de venta       | `/booking?startDate=2024-01-01&typeOfSale=VN` |

---

## 6️⃣ Filtrar hasta una fecha (1970 → endDate)

| Descripción       | Ejemplo                                     |
| ----------------- | ------------------------------------------- |
| Hasta X fecha     | `/booking?endDate=2024-02-01`               |
| Con paginación    | `/booking?endDate=2024-02-01&page=1`        |
| Con tipo de venta | `/booking?endDate=2024-02-01&typeOfSale=VN` |

---

## 7️⃣ Filtrar entre dos fechas

| Descripción           | Ejemplo                                                          |
| --------------------- | ---------------------------------------------------------------- |
| Rango de fechas       | `/booking?startDate=2024-01-01&endDate=2024-01-31`               |
| Rango + paginación    | `/booking?startDate=2024-01-01&endDate=2024-01-31&page=1`        |
| Rango + tipo de venta | `/booking?startDate=2024-01-01&endDate=2024-01-31&typeOfSale=VN` |

---

# ⚠️ Casos que generan error

| Error                 | Ejemplo                                            | Motivo                  |
| --------------------- | -------------------------------------------------- | ----------------------- |
| `month` sin `year`    | `/booking?month=3`                                 | `month` requiere `year` |
| Mezclar año con rango | `/booking?year=2024&startDate=2024-01-01`          | No se pueden combinar   |
| `limit` sin `page`    | `/booking?limit=50`                                | Paginación inválida     |
| startDate > endDate   | `/booking?startDate=2024-02-01&endDate=2024-01-01` | Rango incorrecto        |
| page < 1              | `/booking?page=0`                                  | Página mínima = 1       |

---

# 📝 Notas finales

- Todos los filtros son **opcionales**.
- Si no enviás paginación, el endpoint devuelve **todos los resultados** que coincidan.
- Los filtros están diseñados para ser sencillos y evitar combinaciones confusas.
