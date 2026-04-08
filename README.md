# ThisIsInvoice! (TII)

This is Invoice (TII), a serverless app to manage your quotes and invoices. Made with Vue 3 and Naive UI.

## Security
This app has no server but more : there is no call to third-party API, only local treatment. All of your data is local and only known by you (invoices, clients, your company etc). 

## How does this work
- A necessary first setting of all information (ROADMAP : add a settings export to apply them on other devices)
- PDF libs to read, write and generate PDF in Factur-X format
- Possibility to use a drive (ROADMAP: waiting for Proton Drive API to be deployed) to store your invoices and find them on other devices
