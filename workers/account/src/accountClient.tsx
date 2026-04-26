import { useEffect } from "react";
import { createRoot } from "react-dom/client";

function AccountClient() {
  usePageCacheRefresh();
  useHistoryBackLink();
  useDeleteConfirmation();
  useProfileForm();
  return null;
}

function usePageCacheRefresh() {
  useEffect(() => {
    const reloadPersistedPage = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };

    window.addEventListener("pageshow", reloadPersistedPage);
    return () => {
      window.removeEventListener("pageshow", reloadPersistedPage);
    };
  }, []);
}

function useHistoryBackLink() {
  useEffect(() => {
    const historyBack = document.querySelector("[data-history-back]");
    if (!(historyBack instanceof HTMLAnchorElement)) {
      return;
    }

    const navigateToReturnUrl = (event: MouseEvent) => {
      event.preventDefault();
      window.location.assign(historyBack.href);
    };

    historyBack.addEventListener("click", navigateToReturnUrl);
    return () => {
      historyBack.removeEventListener("click", navigateToReturnUrl);
    };
  }, []);
}

function useDeleteConfirmation() {
  useEffect(() => {
    const deleteForm = document.querySelector("[data-delete-form]");
    if (!(deleteForm instanceof HTMLFormElement)) {
      return;
    }

    const confirmDeletion = (event: SubmitEvent) => {
      if (
        !window.confirm("アカウントを削除します。この操作は取り消せません。")
      ) {
        event.preventDefault();
      }
    };

    deleteForm.addEventListener("submit", confirmDeletion);
    return () => {
      deleteForm.removeEventListener("submit", confirmDeletion);
    };
  }, []);
}

function useProfileForm() {
  useEffect(() => {
    const form = document.querySelector("[data-profile-form]");
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

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
      return;
    }

    const initialValue = input.value.trim();
    const updateSubmitState = () => {
      submit.disabled =
        input.value.trim() === initialValue || !input.checkValidity();
    };
    const openEditor = () => {
      view.classList.add("hidden");
      editor.classList.remove("hidden");
      input.focus();
      input.select();
      updateSubmitState();
    };
    const closeEditor = () => {
      input.value = initialValue;
      editor.classList.add("hidden");
      view.classList.remove("hidden");
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
      submit.disabled = true;
      submit.replaceChildren("保存中");
    };

    edit.addEventListener("click", openEditor);
    cancel.addEventListener("click", closeEditor);
    input.addEventListener("input", updateSubmitState);
    form.addEventListener("submit", updateUrlBeforeSubmit);
    updateSubmitState();

    return () => {
      edit.removeEventListener("click", openEditor);
      cancel.removeEventListener("click", closeEditor);
      input.removeEventListener("input", updateSubmitState);
      form.removeEventListener("submit", updateUrlBeforeSubmit);
    };
  }, []);
}

const root = document.querySelector("[data-account-client-root]");
if (root instanceof HTMLElement) {
  createRoot(root).render(<AccountClient />);
}
