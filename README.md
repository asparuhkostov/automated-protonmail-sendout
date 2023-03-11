## About

This is a screen-scraping based script to automatically send emails using ProtonMail. It can send a message to a list of recipients.
The process is slow, because the method of execution is screen-scraping, instead of API calls. There's no official API, and reverse-engineering the ProtonMail API would be time-consuming.

## Customizing

If you'd like to see the script in action, just disable the headless mode that Puppeteer runs in. Do the following change in the `script.ts` file:
`headless: true` -> `headless: false`.

## Usage

Assuming you have `ts-node` installed globally, and that you've run `npm install`:

```
ts-node ./script.ts YOUR_USERNAME YOUR_PASSWORD EMAIL_SUBJECT "EMAIL_MESSAGE" '["recipient_email_address_1", ...]'
```

If you don't have `ts-node` installed, you can do so by `npm i -g ts-node`.

## Example output

```
{
  res: [
    {
      address: 'john.smith@example.com',
      status: 'ok',
      sent_at: 1678550606447
    }
  ],
  error: undefined
}
```
