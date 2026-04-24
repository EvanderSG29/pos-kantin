import { beginGlobalBusy } from "../app.js";
import { loginWithPin } from "../auth.js";
import { requireGuest } from "../guards.js";
import { goTo, routeForRole } from "../router.js";
import { showToast } from "../components/toast.js";

async function init() {
  const finishRestoreBusy = beginGlobalBusy("Memeriksa sesi login...");

  try {
    const existingSession = await requireGuest();
    if (existingSession?.user) return;
  } finally {
    finishRestoreBusy();
  }

  const form = document.querySelector("#login-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector("button[type='submit']");
    submitButton.disabled = true;

    const finishLoginBusy = beginGlobalBusy("Memproses login...");

    try {
      const email = form.email.value;
      const pin = form.pin.value;
      const session = await loginWithPin(email, pin);
      await goTo(routeForRole(session.user.role), { replace: true });
    } catch (error) {
      showToast(error.message || "Gagal login.", "error");
    } finally {
      finishLoginBusy();
      submitButton.disabled = false;
    }
  });
}

void init();
