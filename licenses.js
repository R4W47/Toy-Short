"use strict";
/* Licencias de código abierto (el mismo archivo en Mallow Blocks, Mallow Mind y Marshmallow Pals).
   En Créditos, el texto de la tipografía lleva data-license="fredoka": al tocarlo se abre
   esta ventana con la licencia completa. Para agregar otra licencia, súmala a LICENSES y
   pon data-license="clave" en el elemento que la abre. */
(() => {
  const LICENSES = {
    fredoka: { name: "Fredoka", text: "Copyright 2016 The Fredoka Project Authors (https://github.com/hafontia/Fredoka-One)\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1. This license is copied below, and is also available with a FAQ at: http://scripts.sil.org/OFL\n\n————————————————\nSIL OPEN FONT LICENSE Version 1.1 - 26 February 2007\n————————————————\n\nPREAMBLE\nThe goals of the Open Font License (OFL) are to stimulate worldwide development of collaborative font projects, to support the font creation efforts of academic and linguistic communities, and to provide a free and open framework in which fonts may be shared and improved in partnership with others.\n\nThe OFL allows the licensed fonts to be used, studied, modified and redistributed freely as long as they are not sold by themselves. The fonts, including any derivative works, can be bundled, embedded, redistributed and/or sold with any software provided that any reserved names are not used by derivative works. The fonts and derivatives, however, cannot be released under any other type of license. The requirement for fonts to remain under this license does not apply to any document created using the fonts or their derivatives.\n\nDEFINITIONS\n\"Font Software\" refers to the set of files released by the Copyright Holder(s) under this license and clearly marked as such. This may include source files, build scripts and documentation.\n\n\"Reserved Font Name\" refers to any names specified as such after the copyright statement(s).\n\n\"Original Version\" refers to the collection of Font Software components as distributed by the Copyright Holder(s).\n\n\"Modified Version\" refers to any derivative made by adding to, deleting, or substituting -- in part or in whole -- any of the components of the Original Version, by changing formats or by porting the Font Software to a new environment.\n\n\"Author\" refers to any designer, engineer, programmer, technical writer or other person who contributed to the Font Software.\n\nPERMISSION & CONDITIONS\nPermission is hereby granted, free of charge, to any person obtaining a copy of the Font Software, to use, study, copy, merge, embed, modify, redistribute, and sell modified and unmodified copies of the Font Software, subject to the following conditions:\n\n1) Neither the Font Software nor any of its individual components, in Original or Modified Versions, may be sold by itself.\n\n2) Original or Modified Versions of the Font Software may be bundled, redistributed and/or sold with any software, provided that each copy contains the above copyright notice and this license. These can be included either as stand-alone text files, human-readable headers or in the appropriate machine-readable metadata fields within text or binary files as long as those fields can be easily viewed by the user.\n\n3) No Modified Version of the Font Software may use the Reserved Font Name(s) unless explicit written permission is granted by the corresponding Copyright Holder. This restriction only applies to the primary font name as presented to the users.\n\n4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font Software shall not be used to promote, endorse or advertise any Modified Version, except to acknowledge the contribution(s) of the Copyright Holder(s) and the Author(s) or with their explicit written permission.\n\n5) The Font Software, modified or unmodified, in part or in whole, must be distributed entirely under this license, and must not be distributed under any other license. The requirement for fonts to remain under this license does not apply to any document created using the Font Software.\n\nTERMINATION\nThis license becomes null and void if any of the above conditions are not met.\n\nDISCLAIMER\nTHE FONT SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM OTHER DEALINGS IN THE FONT SOFTWARE." },
  };

  const es = () => (document.documentElement.lang || "en").toLowerCase().startsWith("es");

  const css = `
    .license-link { all: unset; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
    .license-link::after { content: " ›"; }
    .license-link:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; border-radius: 4px; }
    .license-overlay { position: fixed; inset: 0; z-index: 100000; display: flex; align-items: center; justify-content: center;
      padding: 16px; background: rgba(20, 16, 40, .55); }
    .license-overlay[hidden] { display: none; }
    .license-card { display: flex; flex-direction: column; width: min(520px, 100%); max-height: calc(100vh - 32px);
      background: #fffaf3; color: #3a2e4f; border-radius: 20px; box-shadow: 0 12px 40px rgba(0,0,0,.3);
      font-family: Fredoka, "Trebuchet MS", sans-serif; overflow: hidden; }
    .license-card h2 { margin: 0; padding: 18px 20px 4px; font-size: 20px; font-weight: 700; }
    .license-card p { margin: 0; padding: 0 20px 10px; font-size: 13px; opacity: .75; }
    .license-text { flex: 1; margin: 0 12px; padding: 12px; overflow-y: auto; -webkit-overflow-scrolling: touch;
      background: #f2ebe0; border-radius: 12px; white-space: pre-wrap; word-break: break-word;
      font: 12px/1.45 ui-monospace, Menlo, Consolas, monospace; color: #3a2e4f; }
    .license-ok { margin: 14px 20px 18px; padding: 12px; border: 0; border-radius: 999px; cursor: pointer;
      background: #ff7aa8; color: #fff; font: 700 16px Fredoka, "Trebuchet MS", sans-serif; }
  `;

  let overlay, opener;
  function build() {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    overlay = document.createElement("div");
    overlay.className = "license-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `<div class="license-card" role="dialog" aria-modal="true" aria-labelledby="licenseTitle">
      <h2 id="licenseTitle"></h2><p id="licenseSub"></p><pre class="license-text" tabindex="0"></pre>
      <button class="license-ok" type="button"></button></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector(".license-ok").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) close(); });
  }

  function open(key, from) {
    const lic = LICENSES[key];
    if (!lic) return;
    if (!overlay) build();
    opener = from;
    overlay.querySelector("#licenseTitle").textContent = es() ? "Licencias de código abierto" : "Open-source licenses";
    overlay.querySelector("#licenseSub").textContent = es() ? `Tipografía ${lic.name}` : `${lic.name} font`;
    overlay.querySelector(".license-text").textContent = lic.text;
    overlay.querySelector(".license-text").scrollTop = 0;
    overlay.querySelector(".license-ok").textContent = es() ? "Cerrar" : "Close";
    overlay.hidden = false;
    overlay.querySelector(".license-ok").focus();
  }

  function close() {
    overlay.hidden = true;
    if (opener) opener.focus();
  }

  // El botón "atrás" de Android: si la ventana está abierta, primero se cierra ella
  window.LicensesUI = { isOpen: () => !!overlay && !overlay.hidden, close };

  function setup() {
    if (!document.querySelector("style[data-license-css]")) {
      const s = document.createElement("style"); s.dataset.licenseCss = ""; s.textContent = ".license-link{all:unset;cursor:pointer;text-decoration:underline;text-underline-offset:3px}.license-link::after{content:' ›'}";
      document.head.appendChild(s);
    }
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-license]");
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      open(el.dataset.license, el);
    }, true);
  }
  // Si el juego cambia de pantalla (por ejemplo, con el botón "atrás"), la ventana se cierra
  window.addEventListener("popstate", () => { if (overlay && !overlay.hidden) overlay.hidden = true; });
  window.addEventListener("hashchange", () => { if (overlay && !overlay.hidden) overlay.hidden = true; });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
