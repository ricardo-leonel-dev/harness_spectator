// Karma configuration. Mirrors the Angular CLI default and adds ChromeHeadlessLean,
// a headless launcher that also starts inside restricted sandboxes (no Chrome
// sandbox, no macOS keychain access). The stock ChromeHeadless launcher is unchanged.
module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: {
      jasmine: {},
      clearContext: false,
    },
    jasmineHtmlReporter: {
      suppressAll: true,
    },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage'),
      subdir: '.',
      reporters: [{ type: 'html' }, { type: 'text-summary' }],
    },
    reporters: ['progress', 'kjhtml'],
    customLaunchers: {
      ChromeHeadlessLean: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'],
      },
    },
    browsers: ['ChromeHeadless'],
    restartOnFileChange: true,
  });
};
