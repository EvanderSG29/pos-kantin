import { beginGlobalBusy } from "../app.js";
import { loginSavedProfile, loginWithPassword } from "../auth.js";
import { api } from "../api.js";
import { requireGuest } from "../guards.js";
import { goTo, routeForRole } from "../router.js";
import { showToast } from "../components/toast.js";
import { escapeHtml, getInitials } from "../utils.js";

const PASSWORD_MIN_LENGTH = 8;

function setFormDisabled(form, disabled) {
  form?.querySelectorAll("input, button, select, textarea").forEach((field) => {
    field.disabled = disabled;
  });
}

function renderSavedProfiles(container, section, profiles = []) {
  if (!container || !section) return;

  section.hidden = profiles.length === 0;
  container.innerHTML = profiles
    .map((profile) => {
      const initials = getInitials(profile.nickname || profile.fullName);
      const roleLabel = profile.role === "admin" ? "Admin" : "Petugas";

      return `
        <article class="pos-saved-login-item">
          <button type="button" class="pos-saved-login-user" data-login-user-id="${escapeHtml(profile.userId)}">
            <span class="pos-profile-badge pos-saved-login-avatar" aria-hidden="true">${escapeHtml(initials)}</span>
            <span class="min-w-0 text-left">
              <span class="d-block font-weight-bold text-gray-900 text-truncate">${escapeHtml(profile.nickname || profile.fullName)}</span>
              <span class="d-block small text-gray-600 text-truncate">${escapeHtml(profile.email)}</span>
              <span class="d-block small text-gray-500">${escapeHtml(roleLabel)}</span>
            </span>
          </button>
          <button type="button" class="btn btn-light btn-sm pos-saved-login-remove" data-remove-user-id="${escapeHtml(profile.userId)}" aria-label="Hapus info login ${escapeHtml(profile.nickname || profile.fullName)}">
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </article>
      `;
    })
    .join("");
}

async function loadSavedProfiles(container, section) {
  try {
    const response = await api.listSavedProfiles();
    renderSavedProfiles(container, section, response.data.items || []);
  } catch (error) {
    renderSavedProfiles(container, section, []);
  }
}

function showLoginMode(loginForm, resetPanel) {
  loginForm.hidden = false;
  resetPanel.hidden = true;
}

function showResetMode(loginForm, resetPanel) {
  loginForm.hidden = true;
  resetPanel.hidden = false;
}

async function init() {
  const finishRestoreBusy = beginGlobalBusy("Memeriksa sesi login...");

  try {
    const existingSession = await requireGuest();
    if (existingSession?.user) return;
  } finally {
    finishRestoreBusy();
  }

  const form = document.querySelector("#login-form");
  const savedSection = document.querySelector("#saved-login-section");
  const savedList = document.querySelector("#saved-login-list");
  const showResetButton = document.querySelector("#show-reset-form");
  const resetPanel = document.querySelector("#password-reset-panel");
  const resetRequestForm = document.querySelector("#password-reset-request-form");
  const resetConfirmForm = document.querySelector("#password-reset-confirm-form");
  const backToLoginButton = document.querySelector("#back-to-login");
  if (!form) return;

  await loadSavedProfiles(savedList, savedSection);

  savedList?.addEventListener("click", async (event) => {
    const removeButton = event.target.closest("[data-remove-user-id]");
    if (removeButton) {
      const finishBusy = beginGlobalBusy("Menghapus info login...");
      try {
        await api.removeSavedProfile(removeButton.dataset.removeUserId);
        await loadSavedProfiles(savedList, savedSection);
        showToast("Info login perangkat berhasil dihapus.", "success");
      } catch (error) {
        showToast(error.message || "Gagal menghapus info login.", "error");
      } finally {
        finishBusy();
      }
      return;
    }

    const loginButton = event.target.closest("[data-login-user-id]");
    if (!loginButton) return;

    const finishBusy = beginGlobalBusy("Masuk dari info tersimpan...");
    try {
      const session = await loginSavedProfile(loginButton.dataset.loginUserId);
      await goTo(routeForRole(session.user.role), { replace: true });
    } catch (error) {
      showToast(error.message || "Gagal masuk dari info tersimpan.", "error");
      await loadSavedProfiles(savedList, savedSection);
    } finally {
      finishBusy();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = form.email.value.trim();
    const password = form.password.value;
    const rememberDevice = form.rememberDevice.checked;

    setFormDisabled(form, true);
    const finishLoginBusy = beginGlobalBusy("Memproses login...");

    try {
      const session = await loginWithPassword(email, password, rememberDevice);
      await goTo(routeForRole(session.user.role), { replace: true });
    } catch (error) {
      showToast(error.message || "Gagal login.", "error");
      await loadSavedProfiles(savedList, savedSection);
    } finally {
      finishLoginBusy();
      setFormDisabled(form, false);
    }
  });

  showResetButton?.addEventListener("click", () => {
    resetRequestForm.email.value = form.email.value.trim();
    showResetMode(form, resetPanel);
  });

  backToLoginButton?.addEventListener("click", () => {
    resetRequestForm.reset();
    resetConfirmForm.reset();
    resetConfirmForm.hidden = true;
    showLoginMode(form, resetPanel);
  });

  resetRequestForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = resetRequestForm.email.value.trim();
    setFormDisabled(resetRequestForm, true);
    const finishBusy = beginGlobalBusy("Mengirim OTP...");

    try {
      await api.requestPasswordResetOtp(email);
      resetConfirmForm.email.value = email;
      resetConfirmForm.hidden = false;
      showToast("Jika email terdaftar, kode OTP akan dikirim.", "success");
    } catch (error) {
      showToast(error.message || "Gagal mengirim OTP.", "error");
    } finally {
      finishBusy();
      setFormDisabled(resetRequestForm, false);
    }
  });

  resetConfirmForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const values = Object.fromEntries(new FormData(resetConfirmForm).entries());
    if (String(values.password || "").length < PASSWORD_MIN_LENGTH) {
      showToast(`Password minimal ${PASSWORD_MIN_LENGTH} karakter.`, "error");
      return;
    }
    if (values.password !== values.passwordConfirm) {
      showToast("Konfirmasi password tidak sama.", "error");
      return;
    }

    setFormDisabled(resetConfirmForm, true);
    const finishBusy = beginGlobalBusy("Mengubah password...");

    try {
      await api.resetPasswordWithOtp({
        email: values.email,
        otp: values.otp,
        password: values.password,
      });
      form.email.value = values.email;
      form.password.value = "";
      form.rememberDevice.checked = false;
      resetRequestForm.reset();
      resetConfirmForm.reset();
      resetConfirmForm.hidden = true;
      showLoginMode(form, resetPanel);
      await loadSavedProfiles(savedList, savedSection);
      showToast("Password berhasil diperbarui. Silakan login ulang.", "success");
    } catch (error) {
      showToast(error.message || "Gagal mengubah password.", "error");
    } finally {
      finishBusy();
      setFormDisabled(resetConfirmForm, false);
    }
  });
}

void init();
