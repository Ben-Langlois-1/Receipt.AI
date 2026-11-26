# Receipt.AI classroom release candidate

This is a classroom preview, not a signed public release. Obtain the matching classroom package from the project team and consult the [release validation report](release/validation.md). There is no public installer download advertised by this repository. Windows and macOS packages have been built, installed and run with real inference only on disposable CI runners; check the report's platform table for the exact evidence and limits. An installer filename alone is not proof of support.

## Fedora Linux

1. Download the Receipt.AI `.rpm` package and double-click it.
2. Choose **Install** in the software installer. Enter your computer's password if asked. This preview package is unsigned.
3. Open **Receipt.AI** from the applications menu.

Alternatively, use the `.AppImage`: open its file properties, allow it to run as a program, then double-click it. A normal desktop environment with GTK/X11 libraries is required. No terminal, separate AI server, Node.js, Python, or model download is needed.

## Windows x64

For a package whose CI acceptance run passed (see the release report): double-click the installer `.exe`, follow the installation wizard, and open **Receipt.AI** from the Start menu. Unsigned classroom packages can trigger Windows publisher/SmartScreen warnings. Only proceed with the exact trusted classroom artifact. Do not disable Windows security protections globally.

## macOS

For the matching Apple Silicon or Intel package whose CI acceptance run passed (see the release report): open the `.dmg`, drag the application from the disk image to **Applications**, and open it there. These preview packages are not a substitute for a Developer ID signed and notarized public release. macOS may require a manual security approval for a trusted classroom build; a package passing CI without download quarantine does not establish Gatekeeper approval.

## Try the application

1. Wait for the footer to say the local AI is ready. The bundled model loads automatically, including when offline.
2. Choose **Import CSV**, select the team-supplied synthetic `ReceiptAI-classroom-demo.csv` (if provided), or a supported bank CSV export, review the preview, and confirm the import. This supplied file is synthetic.
3. Open **AI Advisor** and ask: “What should I do to improve my spending habits?”
4. Verified figures appear separately from the model's recommendations. Missing coverage is identified explicitly; transaction cash flow is not a bank balance.
5. Close the application when finished. It stops its own AI process. Reopen it to retain imported transactions and saved application data.

The model runs on the CPU; a dedicated GPU is not required. Approximately 8 GB RAM is a target supported by constrained testing and an estimate, not a physical minimum-hardware certification. Close other large applications if memory is limited.

Existing data in a Vite/browser profile stays in that browser profile and is not silently imported into the desktop profile. Keep original CSVs and existing backups. Do not delete a browser profile expecting the desktop package to contain its edits.

All release files have SHA-256 values in `SHA256SUMS`. Native-runtime source and license materials accompany the distribution under `sources/`; they are not additional runtime setup steps.

For building from source, use the [developer guide](development/README.md). Return to the [project overview](../README.md).
