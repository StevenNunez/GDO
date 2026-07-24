import { ImageResponse } from 'next/og';

// Imagen que se muestra al compartir el sitio (WhatsApp, redes, buscadores).
// Se genera dinámicamente con la marca de la app — no depende de un PNG suelto.
export const alt = 'Gestión de Obras — Control operativo de obras de construcción';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background: 'linear-gradient(135deg, #003F66 0%, #011B2F 100%)',
          color: '#FFFFFF',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Marca */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '96px',
              height: '96px',
              borderRadius: '24px',
              background: '#FFB915',
              color: '#003F66',
              fontSize: '44px',
              fontWeight: 800,
            }}
          >
            GDO
          </div>
          <div style={{ display: 'flex', fontSize: '30px', color: '#BFD4E3', fontWeight: 600 }}>
            Gestión de Obras
          </div>
        </div>

        {/* Título + bajada */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', fontSize: '68px', fontWeight: 800, lineHeight: 1.05 }}>
            Control operativo de obras
            <br />
            de construcción
          </div>
          <div style={{ display: 'flex', fontSize: '32px', color: '#BFD4E3', maxWidth: '900px' }}>
            Materiales y bodega, compras, avance físico, prevención y asistencia — en tiempo real.
          </div>
        </div>

        {/* Público objetivo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', width: '20px', height: '20px', borderRadius: '10px', background: '#FFB915' }} />
          <div style={{ display: 'flex', fontSize: '26px', color: '#E6EEF4', fontWeight: 600 }}>
            Constructoras · Contratistas · Inmobiliarias
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
