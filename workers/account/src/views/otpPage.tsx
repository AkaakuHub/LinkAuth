import { IconBrandDiscord, IconShieldCheck } from "@tabler/icons-react";
import { page } from "../../../shared/html.js";
import { Button, Card, TextInput } from "../../../shared/ui.js";
import { noStoreHeaders } from "./accountLandingPage.js";

export function otpPage(
  challengeId: string,
  returnTo: string,
): Promise<Response> {
  return page(
    "OTP認証",
    <div className="grid flex-1 place-items-center">
      <Card className="grid w-full max-w-lg gap-5">
        <div className="grid gap-2">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <IconBrandDiscord aria-hidden size={18} />
            Discord
          </p>
          <h1 className="text-3xl font-semibold leading-tight text-ink">
            OTP認証
          </h1>
          <p className="text-sm leading-7 text-muted">
            Discord DMに届いた認証コードを入力してください。
          </p>
        </div>
        <form className="grid gap-4" method="post" action="/otp">
          <input type="hidden" name="challenge_id" value={challengeId} />
          <input type="hidden" name="return_to" value={returnTo} />
          <div className="grid gap-2">
            <label className="text-sm font-medium text-ink" htmlFor="otp-code">
              認証コード
            </label>
            <TextInput
              id="otp-code"
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
            />
          </div>
          <Button type="submit">
            <IconShieldCheck aria-hidden size={18} />
            認証
          </Button>
        </form>
      </Card>
    </div>,
    200,
    noStoreHeaders(),
  );
}
