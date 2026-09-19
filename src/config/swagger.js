'use strict';

const swaggerJsdoc = require('swagger-jsdoc');

function buildSwaggerSpec() {
  return swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Business Location Intelligence API',
        version: '1.0.0',
        description: 'Analyzes business competition/opportunity within a radius of a free-text location, using Google Geocoding + Places (New) APIs.',
      },
      servers: [{ url: '/' }],
    },
    apis: ['./src/routes/**/*.js'],
  });
}

module.exports = { buildSwaggerSpec };
