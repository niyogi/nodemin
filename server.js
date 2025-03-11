const express = require('express');
const nodemin = require('./nodemin');

const app = express();
app.use('/admin', nodemin()); // Mount at desired path

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});