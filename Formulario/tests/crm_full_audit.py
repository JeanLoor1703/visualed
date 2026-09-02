"""Auditoría funcional y visual del prototipo CRM VisuaLed."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import Browser, Page, expect, sync_playwright


BASE_URL = os.environ.get("VISUALED_CRM_URL", "http://127.0.0.1:3000/")
EDGE_PATH = os.environ.get(
    "CODEX_TEST_BROWSER",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
)
RESULTS_DIR = Path(__file__).resolve().parent / "results" / "full-audit"


class AuditFailure(AssertionError):
    pass


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AuditFailure(message)


def attach_error_capture(page: Page, errors: list[str]) -> None:
    page.on(
        "console",
        lambda message: errors.append(f"console:{message.type}:{message.text}")
        if message.type == "error"
        else None,
    )
    page.on("pageerror", lambda error: errors.append(f"pageerror:{error}"))


def wait_for_login(page: Page) -> None:
    page.goto(BASE_URL, wait_until="networkidle")
    page.locator("#view-login").wait_for(state="visible")


def reveal_dashboard(page: Page) -> None:
    page.evaluate(
        """() => {
          document.querySelectorAll('.auth-view').forEach((view) => { view.hidden = true; });
          document.querySelector('#view-ready').hidden = false;
          document.body.classList.add('crm-open');
          document.querySelector('#member-name').textContent = 'VisuaLed';
          document.querySelector('#member-role').textContent = 'Administrador';
        }"""
    )
    page.get_by_role("heading", name="Centro de operación", exact=True).wait_for(
        state="visible"
    )


def check_no_horizontal_overflow(page: Page, label: str) -> None:
    overflow = page.evaluate(
        "document.documentElement.scrollWidth > document.documentElement.clientWidth"
    )
    check(not overflow, f"{label}: se detectó desbordamiento horizontal")


def check_accessible_controls(page: Page) -> None:
    duplicate_ids = page.locator("[id]").evaluate_all(
        """elements => {
          const counts = new Map();
          for (const element of elements) counts.set(element.id, (counts.get(element.id) || 0) + 1);
          return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
        }"""
    )
    check(not duplicate_ids, f"IDs duplicados: {', '.join(duplicate_ids)}")

    unlabeled_controls = page.locator("input, select, textarea").evaluate_all(
        """elements => elements
          .filter((element) => !element.labels?.length && !element.getAttribute('aria-label'))
          .map((element) => element.id || element.name || element.tagName)"""
    )
    check(
        not unlabeled_controls,
        f"Controles sin etiqueta: {', '.join(unlabeled_controls)}",
    )

    unnamed_icon_buttons = page.locator("button").evaluate_all(
        """buttons => buttons
          .filter((button) => !button.textContent.trim() && !button.getAttribute('aria-label') && !button.title)
          .map((button) => button.id || button.className || 'button')"""
    )
    check(
        not unnamed_icon_buttons,
        f"Botones de icono sin nombre: {', '.join(unnamed_icon_buttons)}",
    )

    missing_alt = page.locator("img").evaluate_all(
        "elements => elements.filter((image) => !image.hasAttribute('alt')).map((image) => image.src)"
    )
    check(not missing_alt, "Hay imágenes sin atributo alt")


def audit_login(browser: Browser, errors: list[str]) -> None:
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    attach_error_capture(page, errors)
    wait_for_login(page)

    check(page.title() == "Acceso privado | CRM VisuaLed", "Título incorrecto")
    check(page.locator("#view-loading").is_hidden(), "La carga no terminó")
    check(page.locator("#view-ready").is_hidden(), "El CRM se mostró sin sesión")
    check(page.locator("script:not([src])").count() == 0, "Hay scripts inline")
    check(page.locator("script[src^='http']").count() == 0, "Hay scripts remotos")
    check(page.locator("[style]").count() == 0, "Hay estilos inline incompatibles con CSP")
    check(page.locator("#login-username").get_attribute("autocomplete") == "username", "Autocomplete de usuario incorrecto")
    check(page.locator("#login-password").get_attribute("autocomplete") == "current-password", "Autocomplete de contraseña incorrecto")

    password = page.locator("#login-password")
    page.locator("[data-toggle-password='login-password']").click()
    check(password.get_attribute("type") == "text", "No se mostró la contraseña")
    page.locator("[data-toggle-password='login-password']").click()
    check(password.get_attribute("type") == "password", "No se volvió a ocultar la contraseña")

    page.locator("#login-username").fill("usuario-inexistente")
    password.fill("clave-invalida")
    page.get_by_role("button", name="Entrar al panel").click()
    page.locator("#global-message").wait_for(state="visible")
    check(
        page.locator("#global-message").inner_text()
        == "No pudimos completar el acceso. Verifica tus credenciales e inténtalo nuevamente.",
        "El error de acceso revela información o no es neutral",
    )
    check(page.locator("#global-message").get_attribute("data-type") == "error", "El error no tiene estado visual")
    check_no_horizontal_overflow(page, "Login escritorio")
    check_accessible_controls(page)
    page.screenshot(path=str(RESULTS_DIR / "login-desktop.png"), full_page=True)
    page.close()


def audit_dashboard(browser: Browser, errors: list[str]) -> None:
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    attach_error_capture(page, errors)
    requests: list[str] = []
    page.on("request", lambda request: requests.append(request.url))
    wait_for_login(page)
    reveal_dashboard(page)
    request_baseline = len(requests)

    check(page.locator("[data-crm-panel='overview']").is_visible(), "Resumen no visible")
    check(page.locator(".metric-rail article").count() == 4, "Faltan métricas")
    check(page.locator("#recent-participants .participant-row").count() == 5, "Flujo reciente incompleto")
    check(page.locator(".signal-fields li").count() == 7, "No se representan las 7 preguntas")

    page.get_by_role("button", name="Participantes", exact=False).click()
    page.locator("#participant-search").fill("Mora Café")
    check(page.locator("#participant-table-body tr").count() == 1, "Búsqueda de participante incorrecta")
    page.locator("#participant-search").fill("")
    page.locator("#participant-status").select_option(label="Por contactar")
    check(page.locator("#participant-table-body tr").count() == 4, "Filtro de estado incorrecto")
    page.locator("#participant-search").fill("sin coincidencias")
    check(page.locator("#participant-empty").is_visible(), "No aparece el estado vacío")

    page.get_by_role("button", name="Interesados", exact=True).click()
    check(page.locator("#lead-board .lead-column").count() == 3, "Tablero comercial incompleto")
    check(page.locator("#lead-board article").count() == 12, "Se perdieron interesados en el tablero")

    page.get_by_role("button", name="Cupones", exact=True).click()
    check(page.locator("#coupon-detail .coupon-ticket").count() == 3, "Cupones incompletos")

    page.get_by_role("button", name="Sorteo", exact=True).click()
    raffle_select = page.locator("#raffle-coupon")
    raffle_select.select_option("20%")
    check(page.locator("#raffle-pool-count").inner_text() == "4 elegibles", "Filtro del sorteo incorrecto")
    eligible_names = {"Daniela Mora", "Mateo Salazar", "Sofía Castro", "Joaquín Ruiz"}
    page.get_by_role("button", name="Iniciar simulación").click()
    page.locator("#raffle-kicker").filter(has_text="SEÑAL SELECCIONADA").wait_for(timeout=6000)
    winner = page.locator("#raffle-name").inner_text()
    check(winner in eligible_names, f"Ganador fuera del grupo elegible: {winner}")
    expect(page.locator("#raffle-start")).to_be_enabled(timeout=2000)
    check(page.locator("#raffle-start").is_enabled(), "El botón del sorteo quedó bloqueado")
    new_requests = requests[request_baseline:]
    external_mutations = [
        url
        for url in new_requests
        if urlparse(url).hostname and "supabase.co" in (urlparse(url).hostname or "")
    ]
    check(not external_mutations, "El sorteo de demostración hizo solicitudes a Supabase")

    page.get_by_role("button", name="Actividad", exact=True).click()
    check(page.locator("#activity-feed li").count() == 6, "Bitácora incompleta")
    check_no_horizontal_overflow(page, "CRM escritorio")
    check_accessible_controls(page)
    page.screenshot(path=str(RESULTS_DIR / "dashboard-desktop.png"), full_page=True)
    page.close()


def audit_responsive(browser: Browser, errors: list[str]) -> None:
    for width, height, label in [
        (1024, 768, "tablet-horizontal"),
        (768, 1024, "tablet-vertical"),
        (390, 844, "movil"),
    ]:
        page = browser.new_page(viewport={"width": width, "height": height})
        attach_error_capture(page, errors)
        wait_for_login(page)
        reveal_dashboard(page)
        check_no_horizontal_overflow(page, label)

        if width <= 880:
            sidebar = page.locator(".crm-sidebar")
            check(sidebar.get_attribute("inert") is not None, f"{label}: menú cerrado accesible por teclado")
            menu = page.locator("#crm-menu-toggle")
            menu.click()
            page.wait_for_timeout(300)
            check(menu.get_attribute("aria-expanded") == "true", f"{label}: menú no abrió")
            check(sidebar.get_attribute("inert") is None, f"{label}: menú abierto permanece inert")
            page.keyboard.press("Escape")
            page.wait_for_timeout(260)
            check(menu.get_attribute("aria-expanded") == "false", f"{label}: Escape no cerró el menú")
            check(sidebar.get_attribute("inert") is not None, f"{label}: menú cerrado no recuperó inert")
            check(page.evaluate("document.activeElement === document.querySelector('#crm-menu-toggle')"), f"{label}: el foco no volvió al botón")

        page.screenshot(path=str(RESULTS_DIR / f"dashboard-{label}.png"), full_page=True)
        page.close()


def audit_reduced_motion(browser: Browser, errors: list[str]) -> None:
    context = browser.new_context(
        viewport={"width": 1280, "height": 800}, reduced_motion="reduce"
    )
    page = context.new_page()
    attach_error_capture(page, errors)
    wait_for_login(page)
    reveal_dashboard(page)
    page.get_by_role("button", name="Sorteo", exact=True).click()
    page.get_by_role("button", name="Iniciar simulación").click()
    page.locator("#raffle-kicker").filter(has_text="SEÑAL SELECCIONADA").wait_for(timeout=1500)
    page.wait_for_timeout(50)
    running_animations = page.evaluate(
        """document.getAnimations()
          .filter((animation) => animation.playState === 'running')
          .map((animation) => ({
            target: animation.effect?.target?.className || animation.effect?.target?.id || 'unknown',
            name: animation.animationName || 'waapi',
            duration: animation.effect?.getTiming?.().duration
          }))"""
    )
    check(
        not running_animations,
        f"Quedaron animaciones activas con movimiento reducido: {running_animations}",
    )
    check_no_horizontal_overflow(page, "Movimiento reducido")
    context.close()


def audit_callback_cleanup(browser: Browser, errors: list[str]) -> None:
    page = browser.new_page(viewport={"width": 900, "height": 800})
    attach_error_capture(page, errors)
    callback_url = BASE_URL.rstrip("/") + "/auth/invite/?flow=invite"
    page.goto(callback_url, wait_until="networkidle")
    page.locator("#view-login").wait_for(state="visible")
    check(page.url == BASE_URL, f"La URL de callback no se limpió: {page.url}")
    page.close()


def main() -> None:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path=EDGE_PATH)
        try:
            audit_login(browser, errors)
            audit_dashboard(browser, errors)
            audit_responsive(browser, errors)
            audit_reduced_motion(browser, errors)
            audit_callback_cleanup(browser, errors)
        finally:
            browser.close()

    check(not errors, "Errores del navegador:\n" + "\n".join(errors))
    print(
        "AUDIT_OK: login, navegación, filtros, sorteo, responsive, accesibilidad, "
        "movimiento reducido, CSP y limpieza de callback."
    )


if __name__ == "__main__":
    main()
