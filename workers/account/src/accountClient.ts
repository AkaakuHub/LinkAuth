setupPageCacheRefresh();
setupHistoryBackLink();
setupDeleteConfirmation();
setupProfileForm();
setupOtpInput();

function setupPageCacheRefresh(): void {
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      window.location.reload();
    }
  });
}

function setupHistoryBackLink(): void {
  const historyBack = document.querySelector("[data-history-back]");
  if (!(historyBack instanceof HTMLAnchorElement)) {
    return;
  }

  historyBack.addEventListener("click", (event) => {
    event.preventDefault();
    window.location.assign(historyBack.href);
  });
}

function setupDeleteConfirmation(): void {
  const deleteForm = document.querySelector("[data-delete-form]");
  if (!(deleteForm instanceof HTMLFormElement)) {
    return;
  }

  deleteForm.addEventListener("submit", (event) => {
    if (!window.confirm("アカウントを削除します。この操作は取り消せません。")) {
      event.preventDefault();
    }
  });
}

function setupProfileForm(): void {
  const form = document.querySelector("[data-profile-form]");
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const elements = profileFormElements(form);
  if (!elements) {
    return;
  }

  const initialValue = elements.input.value.trim();
  const updateSubmitState = () => {
    elements.submit.disabled =
      elements.input.value.trim() === initialValue ||
      !elements.input.checkValidity();
  };
  const openEditor = () => {
    elements.view.classList.add("hidden");
    elements.editor.classList.remove("hidden");
    elements.input.focus();
    elements.input.select();
    updateSubmitState();
  };
  const closeEditor = () => {
    elements.input.value = initialValue;
    elements.editor.classList.add("hidden");
    elements.view.classList.remove("hidden");
    updateSubmitState();
  };
  const updateUrlBeforeSubmit = () => {
    const currentUrl = new URL(window.location.href);
    const formData = new FormData(form);
    const returnTo = formData.get("return_to");
    if (typeof returnTo === "string") {
      currentUrl.searchParams.set("return_to", returnTo);
      window.history.replaceState(null, "", currentUrl);
    }
    elements.submit.disabled = true;
    elements.submit.replaceChildren("保存中");
  };

  elements.edit.addEventListener("click", openEditor);
  elements.cancel.addEventListener("click", closeEditor);
  elements.input.addEventListener("input", updateSubmitState);
  form.addEventListener("submit", updateUrlBeforeSubmit);
  updateSubmitState();
}

function setupOtpInput(): void {
  const input = document.querySelector("[data-otp-input]");
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  const normalizeOtp = () => {
    const digits = input.value.replace(/\D/g, "").slice(0, 6);
    if (input.value !== digits) {
      input.value = digits;
    }
  };

  input.addEventListener("input", normalizeOtp);
  normalizeOtp();
}

function profileFormElements(form: HTMLFormElement): {
  view: HTMLElement;
  editor: HTMLElement;
  input: HTMLInputElement;
  submit: HTMLButtonElement;
  edit: HTMLButtonElement;
  cancel: HTMLButtonElement;
} | null {
  const view = form.querySelector("[data-profile-view]");
  const editor = form.querySelector("[data-profile-editor]");
  const input = form.querySelector("[data-profile-input]");
  const submit = form.querySelector("[data-profile-submit]");
  const edit = form.querySelector("[data-profile-edit]");
  const cancel = form.querySelector("[data-profile-cancel]");

  if (
    !(view instanceof HTMLElement) ||
    !(editor instanceof HTMLElement) ||
    !(input instanceof HTMLInputElement) ||
    !(submit instanceof HTMLButtonElement) ||
    !(edit instanceof HTMLButtonElement) ||
    !(cancel instanceof HTMLButtonElement)
  ) {
    return null;
  }

  return { view, editor, input, submit, edit, cancel };
}
