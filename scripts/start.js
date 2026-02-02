const backend = process.argv[2] || 'json';
process.env.DATA_BACKEND = backend;
require('../server');
