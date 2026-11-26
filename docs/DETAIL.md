# ELI5 knowledge cards

Select a word or phrase in a chat message and choose **Explain**. The model receives bounded visible text from the same turn to disambiguate the selection. Those excerpts are not saved. Saved terms and aliases are highlighted across conversations and reopen the same floating card. Drag the card by its header or focus the header and use arrow keys. Escape closes the card.

Open **Knowledge graph** from the sidebar for the 3D canvas. Use the gear button to choose the current conversation's model or a fixed model, set the library file, and edit the explanation prompt. Zoom in to see the names below larger nodes; zoom out to hide them. Hover over a node to preview its illustration. Click to open its card, ask follow-up questions, or jump to the conversation that generated the current illustration. Follow-up questions and answers are saved with the card and remain available when it is reopened. Clicking or asking does not change the source conversation.

In **Built-in plugins → 划词解释 / ELI5 cards**, configure the generation prompt, reader background, model, and card library file. The card library section also provides search, deletion, and exports.

## Card library file

Leave the file field blank to use the profile's default storage. To use a custom location, enter an absolute `.json` path (or `~/…`) in an existing folder on the Harness host. A new file starts with a copy of the current library; an existing ELI5 library opens as-is. Switching paths does not merge libraries or delete the previous file. Settings are kept in the profile; cards, illustrations, and follow-ups are kept in the active library. Keep only one Harness host writing to a custom library at a time. The host validates existing files before switching and uses atomic replacement for card updates.

## Verification

`npm run check` builds the client and runs 15 unit tests covering schemas, text matching, graph links and label sizing, custom-file integrity, response parsing, and popup placement. `scripts/check-host.mjs` uses the installed Cordis, Typert Gateway, and JSON backend with a fixture model. It covers prompt and route settings, source metadata, model output repair, follow-up context, custom-path switching, rejection of unrelated JSON, concurrent edits, and persistence across plugin reloads.

After reloading the updated Host and Client in the authenticated Harness UI, verify that the sidebar opens a canvas with no tabs, names appear and disappear when zooming, hovering and clicking open the expected cards, and the source button opens the correct conversation. Submit a follow-up, reopen its card, and check that both the question and answer remain.
