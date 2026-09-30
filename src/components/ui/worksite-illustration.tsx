/** Architectural illustration made from simple shapes; no external assets. */
export function WorksiteIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 260" fill="none" aria-hidden="true" className={className}>
      <circle cx="349" cy="70" r="41" fill="#FFB915" />
      <path d="M22 218C96 161 131 222 205 206C280 190 334 169 458 218V260H22Z" fill="#DCE8EF" />
      <path d="M72 216V91L180 63V216" fill="#B8CDDA" />
      <path d="M180 63L239 94V216H180V63Z" fill="#789CB4" />
      <path d="M88 102L163 82V112L88 127V102ZM88 143L163 130V159L88 168V143ZM88 183L163 176V211H88V183Z" fill="#F5F8FA" />
      <path d="M198 101L223 113V138L198 130V101ZM198 147L223 154V179L198 176V147Z" fill="#003F66" />
      <path d="M238 216V134L333 108V216H238Z" fill="#D7E4EC" />
      <path d="M333 108L392 137V216H333V108Z" fill="#8FAFC2" />
      <path d="M254 145L278 139V167L254 171V145ZM294 134L318 127V161L294 165V134ZM254 186L278 183V214H254V186ZM294 181L318 178V214H294V181Z" fill="#F5F8FA" />
      <path d="M349 147L376 158V183L349 176V147Z" fill="#003F66" />
      <path d="M272 110V30H119M250 30V106M250 30L272 10L300 30H392M272 10V30M250 46H272M250 67H272M250 88H272M131 30V61" stroke="#003F66" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M130 61V71H140" stroke="#003F66" strokeWidth="3" strokeLinecap="round" />
      <path d="M47 220H424" stroke="#789CB4" strokeWidth="3" strokeLinecap="round" />
      <path d="M421 217V171" stroke="#003F66" strokeWidth="4" />
      <ellipse cx="422" cy="172" rx="19" ry="31" fill="#789CB4" />
      <path d="M54 219V193" stroke="#003F66" strokeWidth="3" />
      <ellipse cx="54" cy="187" rx="13" ry="21" fill="#B8CDDA" />
      <path d="M214 235H313" stroke="#B8CDDA" strokeWidth="5" strokeLinecap="round" />
      <path d="M114 247H212" stroke="#B8CDDA" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
