import Cropper from "cropperjs";

setupPageCacheRefresh();
setupHistoryBackLink();
setupDeleteConfirmation();
setupProfileForm();
setupAvatarUpload();
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
    elements.form.classList.remove("hidden");
    elements.input.focus();
    elements.input.select();
    updateSubmitState();
  };
  const closeEditor = () => {
    elements.input.value = initialValue;
    elements.form.classList.add("hidden");
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

  elements.editTrigger.addEventListener("click", openEditor);
  elements.cancel.addEventListener("click", closeEditor);
  elements.input.addEventListener("input", updateSubmitState);
  form.addEventListener("submit", updateUrlBeforeSubmit);
  updateSubmitState();
}

function setupAvatarUpload(): void {
  const input = document.querySelector("[data-avatar-input]");
  const csrfToken = document.querySelector("[data-avatar-csrf]");
  const status = document.querySelector("[data-avatar-status]");
  const dialog = document.querySelector("[data-avatar-cropper-dialog]");
  const image = document.querySelector("[data-avatar-cropper-image]");
  const save = document.querySelector("[data-avatar-cropper-save]");
  const cancel = document.querySelector("[data-avatar-cropper-cancel]");
  if (
    !(input instanceof HTMLInputElement) ||
    !(csrfToken instanceof HTMLInputElement) ||
    !(status instanceof HTMLElement) ||
    !(dialog instanceof HTMLDialogElement) ||
    !(image instanceof HTMLImageElement) ||
    !(save instanceof HTMLButtonElement) ||
    !(cancel instanceof HTMLButtonElement)
  ) {
    return;
  }

  let cropper: Cropper | null = null;
  let imageUrl: string | null = null;

  const closeCropper = () => {
    cropper?.destroy();
    cropper = null;
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
      imageUrl = null;
    }
    dialog.close();
    input.value = "";
  };

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    status.textContent = "";
    cropper?.destroy();
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }
    imageUrl = URL.createObjectURL(file);
    image.addEventListener(
      "load",
      () => {
        cropper = new Cropper(image, {
          aspectRatio: 1,
          autoCropArea: 1,
          background: false,
          viewMode: 1,
        });
      },
      { once: true },
    );
    image.src = imageUrl;
    dialog.showModal();
  });

  save.addEventListener("click", async () => {
    if (!cropper) {
      return;
    }
    status.textContent = "更新中";
    input.disabled = true;
    save.disabled = true;
    try {
      const canvas = cropper.getCroppedCanvas({
        height: 512,
        imageSmoothingQuality: "high",
        width: 512,
      });
      const blob = await canvasToWebp(canvas);
      const response = await fetch("/avatar", {
        method: "POST",
        headers: {
          "content-type": "image/webp",
          "x-csrf-token": csrfToken.value,
        },
        body: blob,
      });
      if (!response.ok) {
        status.textContent = "更新できませんでした";
        return;
      }
      window.location.reload();
    } catch {
      status.textContent = "更新できませんでした";
    } finally {
      input.disabled = false;
      save.disabled = false;
      closeCropper();
    }
  });

  cancel.addEventListener("click", closeCropper);
  dialog.addEventListener("cancel", closeCropper);
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
  form: HTMLFormElement;
  input: HTMLInputElement;
  submit: HTMLButtonElement;
  editTrigger: HTMLButtonElement;
  cancel: HTMLButtonElement;
} | null {
  const input = form.querySelector("[data-profile-input]");
  const submit = form.querySelector("[data-profile-submit]");
  const editTrigger = document.querySelector("[data-profile-edit-trigger]");
  const cancel = form.querySelector("[data-profile-cancel]");

  if (
    !(input instanceof HTMLInputElement) ||
    !(submit instanceof HTMLButtonElement) ||
    !(editTrigger instanceof HTMLButtonElement) ||
    !(cancel instanceof HTMLButtonElement)
  ) {
    return null;
  }

  return { form, input, submit, editTrigger, cancel };
}

function canvasToWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("webp conversion failed"));
      },
      "image/webp",
      0.9,
    );
  });
}
