import puppeteer, { Browser, Page } from "puppeteer";

const processLog: ProcessLog[] = [];
let browser: Browser;

const PROTON_MAIL_LOGIN_URL = "https://account.proton.me/login";
const PROTON_MAIL_INBOX_URL = "https://mail.proton.me/u/0/inbox";

enum PageElementSelectors {
  USERNAME_INPUT = "#username",
  PASSWORD_INPUT = "#password",
  SUBMIT_CREDS_BUTTON = "[type='submit']",
  NEW_MESSAGE_BUTTON = ".button.button-large.button-solid-norm",
  NEW_MESSAGE_WINDOW = "span.cursor-move",
  TO_ADDRESS_INPUT = "[placeholder='Email address']",
  SUBJECT_INPUT = "[placeholder='Subject']",
  COMPOSER_FRAME = "[title='Email composer']",
  COMPOSER_FIELD = "#rooster-editor",
  SEND_MESSAGE_BUTTON = "[data-testid='composer:send-button']",
  SUCCESSFUL_SENDOUT_MESSAGE = "div[role='alert'].bg-success",
}
enum Errors {
  MISSING_SENDOUT_DATA = "Missing sendout data, please check your input.",
  AUTH_ELEMENTS_UNAVAILABLE = "Could not find the auth input elements.",
  SUBMIT_AUTH_CREDS_BUTTON_UNAVAILABLE = "Could not find the authentication credentials submission button.",
  NEW_MESSAGE_BUTTON_UNAVAILABLE = "Could not find the new message button.",
  NEW_MESSAGE_WINDOW_UNAVAILABLE = "Could not find the new message window.",
  TO_ADDRESS_INPUT_UNAVAILABLE = "Could not find the 'to' address input field element.",
  MESSAGE_INPUT_FIELD_ELEMENT_UNAVAILABLE = "Could not find the message input field element.",
  SEND_MESSAGE_ELEMENT_UNAVAILABLE = "Could not find the send message button.",
  SUBJECT_INPUT_FIELD_ELEMENT_UNAVAILABLE = "Could not find the subject input field element.",
  SEND_MESSAGE_ERROR = "Message submitted, but delivery was unsuccessful.",
}
enum Status {
  OK = "ok",
  ERROR = "error",
}

type SendoutData = {
  username: string;
  password: string;
  recipients: string[];
  subject: string;
  message: string;
};
type ProcessLog = {
  address: string;
  status: Status;
  sent_at: number | null;
};

async function waitFor(milliseconds: number) {
  return new Promise((res, _) => setTimeout(res, milliseconds));
}

async function setUpEnv() {
  const browser = await puppeteer.launch({ headless: true });
  return browser;
}

async function logIn(browser: Browser, username: string, password: string) {
  const page = await browser.newPage();
  await page.goto(PROTON_MAIL_LOGIN_URL);
  await page.waitForNetworkIdle();

  const usernameInput = await page.$(PageElementSelectors.USERNAME_INPUT);
  const passwordInput = await page.$(PageElementSelectors.PASSWORD_INPUT);
  if (usernameInput && passwordInput) {
    await usernameInput.type(username);
    await passwordInput.type(password);
    const submitCredsButton = await page.$(
      PageElementSelectors.SUBMIT_CREDS_BUTTON
    );
    if (submitCredsButton) {
      await page.evaluate((selector) => {
        //@ts-ignore
        document.querySelector(selector).click();
      }, PageElementSelectors.SUBMIT_CREDS_BUTTON);
      let isOnInboxPageChecks = 0;
      while (isOnInboxPageChecks < 15) {
        const url = page.url();
        if (url === PROTON_MAIL_INBOX_URL) {
          break;
        }
        isOnInboxPageChecks++;
      }
      await page.waitForNetworkIdle({ idleTime: 5000 });
      // The UI usually takes a while to render,
      // hence this additional waiting.
      await waitFor(7500);

      return page;
    } else {
      throw new Error(Errors.SUBMIT_AUTH_CREDS_BUTTON_UNAVAILABLE);
    }
  } else {
    throw new Error(Errors.AUTH_ELEMENTS_UNAVAILABLE);
  }
}

async function sendEmail(
  page: Page,
  address: string,
  subject: string,
  message: string
) {
  try {
    await page.evaluate((selector) => {
      //@ts-ignore
      document.querySelector(selector).click();
    }, PageElementSelectors.NEW_MESSAGE_BUTTON);
  } catch (e) {
    throw new Error(Errors.NEW_MESSAGE_BUTTON_UNAVAILABLE);
  }

  try {
    await page.waitForSelector(PageElementSelectors.NEW_MESSAGE_WINDOW, {
      timeout: 5000,
    });
  } catch (e) {
    throw new Error(Errors.NEW_MESSAGE_WINDOW_UNAVAILABLE);
  }

  const toAddressInput = await page.$(PageElementSelectors.TO_ADDRESS_INPUT);
  if (toAddressInput) {
    await toAddressInput.type(address);
    await waitFor(2000);

    const subjectInput = await page.$(PageElementSelectors.SUBJECT_INPUT);
    if (subjectInput) {
      await subjectInput.type(subject);
      const composerFrame = await page.$(PageElementSelectors.COMPOSER_FRAME);
      const frameContent = await composerFrame?.contentFrame();
      if (frameContent) {
        await frameContent.type(PageElementSelectors.COMPOSER_FIELD, message);
        const sendMessageButton = await page.$(
          PageElementSelectors.SEND_MESSAGE_BUTTON
        );
        if (sendMessageButton) {
          await page.evaluate((selector) => {
            //@ts-ignore
            document.querySelector(selector).click();
          }, PageElementSelectors.SEND_MESSAGE_BUTTON);
          // try {
          //   await page.waitForSelector(
          //     PageElementSelectors.SUCCESSFUL_SENDOUT_MESSAGE,
          //     { timeout: 10000 }
          //   );
          //   return Status.OK;
          // } catch (e) {
          //   throw new Error(Errors.SEND_MESSAGE_ERROR);
          // }

          // ^ not doable since when a "Message sent" popup shows up
          // it stays for several seconds, so if we check for its existence
          // after clicking the "Send" button the script thinks it's about
          // the latest sendout.
          return Status.OK;
        } else {
          throw new Error(Errors.SEND_MESSAGE_ELEMENT_UNAVAILABLE);
        }
      } else {
        throw new Error(Errors.MESSAGE_INPUT_FIELD_ELEMENT_UNAVAILABLE);
      }
    } else {
      throw new Error(Errors.SUBJECT_INPUT_FIELD_ELEMENT_UNAVAILABLE);
    }
  } else {
    throw new Error(Errors.TO_ADDRESS_INPUT_UNAVAILABLE);
  }
}

async function doSendout(sendoutData: SendoutData) {
  try {
    const { username, password, subject, message, recipients } = sendoutData;
    if (Object.values(sendoutData).some((field: any) => !field?.length)) {
      throw new Error(Errors.MISSING_SENDOUT_DATA);
    }
    browser = await setUpEnv();
    const page = await logIn(browser, username, password);
    for (const address of recipients) {
      const status = await sendEmail(page, address, subject, message);
      const sendoutEventPayload = {
        address,
        status,
        sent_at: status === Status.OK ? new Date().valueOf() : null,
      };
      processLog.push(sendoutEventPayload);
    }
    await waitFor(5000);
    return { res: processLog, error: undefined };
  } catch (error) {
    return { res: undefined, error };
  } finally {
    browser?.close();
  }
}

doSendout({
  username: process.argv[2],
  password: process.argv[3],
  subject: process.argv[4],
  message: process.argv[5],
  recipients: JSON.parse(process.argv[6]),
})
  .then((res) => console.log(res))
  .catch((e) => console.log(e));
