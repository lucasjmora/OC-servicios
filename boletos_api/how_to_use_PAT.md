# 🔐 Cómo usar un Personal Access Token (PAT) para consumir la API

Este documento explica **de manera simple y práctica** cómo un usuario o sistema externo puede utilizar un **Personal Access Token (PAT)** para autenticar solicitudes hacia la API protegida.

---

# 🧩 ¿Qué es un Personal Access Token?

Un **Personal Access Token** es una clave larga que funciona como una “llave de acceso” para consumir la API sin necesidad de:

- usuario/contraseña
- login
- JWT
- sesiones

Es ideal para:

- Bots
- Integraciones con otros sistemas
- Scripts automatizados
- Servicios internos
- Accesos no interactivos

---

# 🧪 Cómo se usa el token en los requests

Para autenticar cualquier endpoint protegido, debés enviar el token en el header **Authorization**, usando el formato:

```
Authorization: Bearer <TU_TOKEN>
```

Ejemplo:

```
Authorization: Bearer 9f3b1c52cd39d78a5cc9a3e414ad98f20c0a4012c8
```

---

# 🚀 Ejemplos según la herramienta que uses

---

## 1️⃣ **Usar el token con cURL**

```bash
curl -X GET "https://tu-api.com/bookings"   -H "Authorization: Bearer TU_TOKEN_AQUI"
```

---

## 2️⃣ **Usar el token con JavaScript (fetch)**

```js
fetch("https://tu-api.com/bookings", {
  headers: {
    Authorization: "Bearer TU_TOKEN_AQUI",
  },
})
  .then((res) => res.json())
  .then((data) => console.log(data));
```

---

## 3️⃣ **Usar el token con Axios**

```js
import axios from "axios";

axios
  .get("https://tu-api.com/bookings", {
    headers: {
      Authorization: `Bearer TU_TOKEN_AQUI`,
    },
  })
  .then((res) => console.log(res.data))
  .catch((err) => console.error(err));
```

---

## 4️⃣ **Usar el token en Postman**

1. Abrir una request
2. Ir a la pestaña **Headers**
3. Agregar:

| Key           | Value                  |
| ------------- | ---------------------- |
| Authorization | `Bearer TU_TOKEN_AQUI` |

O:

- Ir a **Authorization**
- Tipo: **Bearer Token**
- Pegar el token

---

## 5️⃣ **Usar el token desde un backend Node.js**

```js
const axios = require("axios");

async function getBookings() {
  const response = await axios.get("https://tu-api.com/bookings", {
    headers: {
      Authorization: "Bearer TU_TOKEN_AQUI",
    },
  });

  console.log(response.data);
}

getBookings();
```

---

# 🔁 ¿Los tokens tienen vencimiento?

Depende del sistema, pero en nuestro caso:

- **No vencen automáticamente**
- Se pueden **revocar** para invalidarlos
- El backend registra **cuándo fue la última vez que se usó** (`lastUsedAt`)

Si un token es revocado:

- cualquier request con ese token dará
  ```
  401 Unauthorized: Invalid token or revoked token
  ```

---

# 🛡 Buenas prácticas recomendadas

✔ Guardar el token como una contraseña  
✔ No subirlo a repositorios (GitHub, GitLab, etc.)  
✔ Revocar tokens que ya no se usen  
✔ Usar tokens distintos para cada integración  
✔ Rotar tokens periódicamente si es necesario

---

# 🔮 Mejoras y actualizaciones futuras

- Se podrá tener más de un **PAT**.
- Los usuarios podrán generar **PATs**
- A cada **PAT** se le podrá asignar un nombre, con el objetivo de usar distintos tokens para cada integración.
- Los usuarios podrán revocar **PATs**
