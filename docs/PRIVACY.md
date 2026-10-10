# Privacy

Live Canvas is designed to work entirely inside Obsidian.

## Data it reads

- Markdown file paths and metadata in the open vault
- Resolved internal links and backlinks
- The configured target Canvas
- Plugin settings stored by Obsidian

## Data it writes

- The configured `.canvas` file
- Live Canvas settings in Obsidian's plugin data file
- A new local `.pdf` file when the user explicitly runs PDF export

PDF export reads only the saved Canvas structure. It does not read note bodies separately, contact a conversion service, or replace an existing PDF.

## Data it does not collect

Live Canvas has no analytics, telemetry, advertisements, account system, cloud service, remote API, or required network connection. It does not upload note names, paths, contents, links, settings, or usage data.

The development and release process may use GitHub and npm, but the installed plugin does not need them and makes no network requests.
