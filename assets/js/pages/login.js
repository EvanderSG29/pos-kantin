import { loginWithPin } from "../auth.js";
import { requireGuest } from "../guards.js";
import { routeForRole, goTo } from "../router.js";
import { showToast } from "../components/toast.js";

async function init() {
  await requireGuest();

  const form = document.querySelector("#login-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector("button[type='submit']");
    submitButton.disabled = true;

    try {
      const email = form.email.value;
      const pin = form.pin.value;
      const session = await loginWithPin(email, pin);
      showToast("Login berhasil.", "success");
      goTo(routeForRole(session.user.role));
    } catch (error) {
      showToast(error.message || "Gagal login.", "error");
    } finally {
      submitButton.disabled = false;
    }
  });
}

init();

