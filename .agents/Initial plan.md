I want to convert the previous vigotech page in /works/vigotech/vigotech.github.io to astro.

- Designs are in google gtitch (use the mcp)
- Note the data (groups, events, etc came from /works/vigotech/vigotech.github.io/vigotech.json and /works/vigotech/vigotech.github.io/vigotech-generated.json files (the generated one github action), use the astro collection to import that file. I guess the best architecture for collections are "GRoups", "Events" (related to groups) and "Videos" related to groups (we will list all in the same page but with filter) and also friends (from /works/vigotech/vigotech.github.io/friends.json)
- In the hero use shaders.com to create a nice interactive dots animation (https://shaders.com/docs/guide)
- Create a tailwind theme for the page, with a dark mode toggle (use the tailwind dark mode feature)
- For the layout, create a responsive design that works well on both desktop and mobile devices. Following the desing in \***\*\*\*\*\*\*\***\*\***\*\*\*\*\*\*\***
- Create the home page: Project ID: 12052849150725556223 VigoTech - Home (Desktop ID: f0a0a53532f145f48847c38a284ba2f1

- Create the Videos page: A list of cards with videos thumgnail allowing to filter by group
- Create the text pages: Manifesto (https://github.com/VigoTech/documentos/blob/master/manifiesto.md), Código de conducta (https://github.com/VigoTech/documentos/blob/master/codigodeconducta.md), Condicións de entrada (https://github.com/VigoTech/documentos/blob/master/condicionsentrada.md), Código de conducta en Slack (https://github.com/VigoTech/documentos/blob/master/conducta_slack.md), we get the content sources as collection, not copy the md files, maybe we can have a async collection loader to get those files content on each build
-
