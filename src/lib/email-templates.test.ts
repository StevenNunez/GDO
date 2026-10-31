import { describe, it, expect } from 'vitest';
import { correoInvitacion, correoPasswordRestablecida, correoRecuperacion } from './email-templates';

const ENLACE = 'https://www.gestiondeobras.app/nueva-contrasena?token=abc123';

describe('correos con acceso: nunca llevan la contraseña', () => {
  it('la invitación trae el enlace y no pide ni muestra contraseña', () => {
    const c = correoInvitacion({
      nombre: 'Ana', email: 'ana@obra.cl', enlace: ENLACE, empresa: 'Constructora Sur', rolLabel: 'Supervisor',
    });
    for (const cuerpo of [c.text, c.html]) {
      expect(cuerpo).toContain(ENLACE);
      expect(cuerpo).toContain('ana@obra.cl');
    }
    expect(c.text).not.toMatch(/Contraseña:\s/);
    expect(c.html).toContain('Crear mi contraseña');
  });

  it('si no hubo enlace, explica cómo pedir uno y no se rompe', () => {
    const c = correoInvitacion({
      nombre: 'Ana', email: 'ana@obra.cl', enlace: null, empresa: 'X', rolLabel: 'Supervisor',
    });
    expect(c.text).toContain('¿Olvidaste tu contraseña?');
    expect(c.html).not.toContain('href="null"');
  });

  it('el aviso de cambio hecho por un administrador no repite la clave', () => {
    const c = correoPasswordRestablecida({ nombre: 'Luis', email: 'luis@obra.cl', enlace: ENLACE, empresa: 'X' });
    expect(c.text).toContain(ENLACE);
    expect(c.text).not.toMatch(/Contraseña nueva/i);
    expect(c.html).not.toMatch(/<code/);
  });

  it('la recuperación lleva solo el enlace', () => {
    const c = correoRecuperacion({ enlace: ENLACE });
    expect(c.text).toContain(ENLACE);
    expect(c.subject).toMatch(/contraseña/i);
  });

  it('escapa el nombre en el HTML', () => {
    const c = correoInvitacion({
      nombre: '<script>x</script>', email: 'a@b.cl', enlace: ENLACE, empresa: 'X', rolLabel: 'Y',
    });
    expect(c.html).not.toContain('<script>');
  });
});
