# Vibe Tasks — Pila de prioridades

Aplicación web ligera para gestionar tareas en forma de pila de prioridades. Las tareas se guardan en localStorage del navegador, por lo que permanecen al cerrar/abrir la aplicación en el mismo equipo y navegador.

Características principales:
- Crear tareas con título, descripción, fecha/hora de entrega y prioridad inicial (verde/naranja/rojo).
- Visualización en forma de pila: las tareas se ordenan por prioridad (alta encima) y por orden del usuario dentro de la misma prioridad.
- Las tareas aumentan su prioridad automáticamente según la cercanía de la fecha de entrega; el umbral es configurable (días para pasar a media/alta).
- Arrastrar y soltar las tarjetas para reordenarlas manualmente en la pila.
- Botón para marcar una tarea como realizada (la elimina).

Cómo usar
1. Abrir `index.html` en un navegador moderno (Chrome/Edge/Firefox/Safari).
2. Pulsar "Nueva tarea" para crear una tarea.
3. Pulsar "Configuración" para ajustar los días que disparan el aumento de prioridad.
4. Arrastrar las tarjetas para reorganizarlas.

Notas técnicas
- Almacenamiento: `localStorage` con clave `vibe:tasks`. Configuración en `vibe:config`.
- Lógica de prioridad: si una tarea tiene fecha de entrega, se calcula el tiempo restante en días; si queda menos o igual que `highDays` pasa a alta; si queda <= `mediumDays` pasa a media; en otro caso baja.
- Reordenado: arrastrando una tarjeta se reordenan los `orderIndex` de las tareas y se guarda el nuevo orden.
- Si una tarea no tiene fecha de entrega, su prioridad no se actualizará automáticamente.

Mejoras posibles (futuras):
- Añadir búsqueda/filtrado y paginación.
- Sincronización con backend o export/import.
- Notificaciones/recordatorios.


  Imagenes:
  <img width="1920" height="1048" alt="Captura de pantalla" src="https://github.com/user-attachments/assets/26c8214c-1eaa-4a9a-9732-ec97d34ac433" />
  <img width="1920" height="1048" alt="Captura de pantalla do 2025-10-26 19-48-31" src="https://github.com/user-attachments/assets/d4f1df37-003b-4242-ba1b-beebb4bf4d56" />
<img width="1920" height="1048" alt="Captura de pantalla do 2025-10-26 19-48-39" src="https://github.com/user-attachments/assets/aa37ce55-f1e3-4f9b-ba2d-0cd380252322" />
<img width="1920" height="1048" alt="Captura de pantalla do 2025-10-26 19-49-46" src="https://github.com/user-attachments/assets/6f0e8636-e524-4a04-b51e-9f5ff1281e92" />



Licencia: MIT (código de ejemplo)
