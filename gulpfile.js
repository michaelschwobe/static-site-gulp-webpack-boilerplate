'use strict';

const autoprefixer = require('gulp-autoprefixer');
const browserSync = require('browser-sync').create();
const changed = require('gulp-changed');
const cleanCSS = require('gulp-clean-css');
const del = require('del');
const gulp = require('gulp');
const imagemin = require('gulp-imagemin');
const MinifyPlugin = require('babel-minify-webpack-plugin');
const named = require('vinyl-named');
const noop = require('gulp-noop');
const notify = require('gulp-notify');
const plumber = require('gulp-plumber');
const runSequence = require('run-sequence');
const sass = require('gulp-sass');
const sourcemaps = require('gulp-sourcemaps');
const webpack = require('webpack-stream');

//------------------------------------------------------------------------------
// Configuration.
//------------------------------------------------------------------------------

// Environment configuration.
const isProd = process.env.NODE_ENV === 'production';

// Directory configuration.
// Must have values, don't use leading or trailing slashes.
const dirs = {
  entry: 'src',
  output: 'build',
};

// Path configuration.
// Must have values, don't use leading or trailing slashes.
const paths = {
  views: {
    src: `${dirs.entry}/views/**/*`,
    dest: `${dirs.output}`,
  },
  media: {
    src: `${dirs.entry}/media/**/*.+(gif|jpg|jpeg|png|svg)`,
    dest: `${dirs.output}/static/media`,
  },
  styles: {
    src: `${dirs.entry}/styles/**/*.+(css|scss)`,
    dest: `${dirs.output}/static/styles`,
  },
  scripts: {
    src: [
      `${dirs.entry}/scripts/**/*.js`,
      `!${dirs.entry}/scripts/**/*.module.js`,
    ],
    dest: `${dirs.output}/static/scripts`,
  },
};

// Plugin configurations.
// Use an empty object for empty configurations.
const pluginConfig = {
  autoprefixer: { browsers: ['last 2 versions'] },
  browserSync: {
    port: process.env.PORT || 3000,
    server: { baseDir: `${dirs.output}` },
  },
  cleanCSS: [
    { debug: true },
    ({ name, stats }) => {
      console.log(`Original size of ${name}: ${stats.originalSize} bytes`);
      console.log(`Minified size of ${name}: ${stats.minifiedSize} bytes`);
    },
  ],
  imagemin: [
    imagemin.gifsicle({ interlaced: true, optimizationLevel: 3 }),
    imagemin.jpegtran({ progressive: true }),
    imagemin.optipng({ optimizationLevel: 7 }),
    imagemin.svgo({
      plugins: [{ removeUselessDefs: false }, { cleanupIDs: false }],
    }),
  ],
  plumber: {
    errorHandler(...args) {
      notify
        .onError({
          title: 'Compile Error',
          message: '<%= error.message %>',
          sound: 'Funk',
        })
        .apply(this, args);
      this.emit('end');
    },
  },
  sass: {
    outputStyle: 'expanded',
    includePaths: ['node_modules'],
  },
  sourcemaps: '.',
  webpack: {
    devtool: isProd ? 'cheap-source-map' : 'cheap-eval-source-map',
    module: {
      rules: [
        {
          test: /\.js$/,
          loader: 'babel-loader',
          options: { presets: ['env'] },
        },
      ],
    },
    plugins: isProd ? [new MinifyPlugin({ removeConsole: true })] : [],
  },
};

//------------------------------------------------------------------------------
// Errors.
//------------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Views.
// -----------------------------------------------------------------------------

gulp.task('views', () =>
  gulp
    // Input.
    .src(paths.views.src)
    // Report errors.
    .pipe(plumber(pluginConfig.plumber))
    // Production: Do nothing.
    // Development: Pipe only changed files to the next process.
    .pipe(isProd ? noop() : changed(paths.views.dest))
    // Output.
    .pipe(gulp.dest(paths.views.dest)),
);

//------------------------------------------------------------------------------
// Media.
//------------------------------------------------------------------------------

gulp.task('media', () =>
  gulp
    // Input.
    .src(paths.media.src)
    // Report errors.
    .pipe(plumber(pluginConfig.plumber))
    // Production: Do nothing.
    // Development: Pipe only changed files to the next process.
    .pipe(isProd ? noop() : changed(paths.media.dest))
    // Production: Optimize.
    // Development: Do Nothing.
    .pipe(isProd ? imagemin(pluginConfig.imagemin) : noop())
    // Output.
    .pipe(gulp.dest(paths.media.dest))
    // Production: Do nothing.
    // Development: Stream changes back to 'watch' tasks.
    .pipe(isProd ? noop() : browserSync.stream()),
);

//------------------------------------------------------------------------------
// Styles.
//------------------------------------------------------------------------------

gulp.task('styles', () =>
  gulp
    // Input.
    .src(paths.styles.src)
    // Report errors.
    .pipe(plumber(pluginConfig.plumber))
    // Production: Do nothing.
    // Development: Pipe only changed files to the next process.
    .pipe(isProd ? noop() : changed(paths.styles.dest))
    // Start mapping original source.
    .pipe(sourcemaps.init())
    // Convert to CSS.
    .pipe(sass(pluginConfig.sass))
    // Add browser compatibility.
    .pipe(autoprefixer(pluginConfig.autoprefixer))
    // Production: Minify.
    // Development: Do nothing.
    .pipe(isProd ? cleanCSS(...pluginConfig.cleanCSS) : noop())
    // Save mapping for easier debugging.
    .pipe(sourcemaps.write(pluginConfig.sourcemaps))
    // Output.
    .pipe(gulp.dest(paths.styles.dest))
    // Production: Do nothing.
    // Development: Stream changes back to 'watch' tasks.
    .pipe(isProd ? noop() : browserSync.stream()),
);

//------------------------------------------------------------------------------
// Scripts.
//------------------------------------------------------------------------------

gulp.task('scripts', () =>
  gulp
    // Input.
    .src(paths.scripts.src)
    // Report errors.
    .pipe(plumber(pluginConfig.plumber))
    // Automatically pass named chunks to webpack.
    .pipe(named())
    // Bundle.
    .pipe(webpack(pluginConfig.webpack))
    // Output.
    .pipe(gulp.dest(paths.scripts.dest)),
);

//------------------------------------------------------------------------------
// Serve.
//------------------------------------------------------------------------------

// Development.
// Starts the browserSync server.
gulp.task('serve', () => browserSync.init(pluginConfig.browserSync));

//------------------------------------------------------------------------------
// Watch.
//------------------------------------------------------------------------------

// Ensures the 'views' task is complete before reloading browsers.
gulp.task('views:watch', ['views'], done => {
  browserSync.reload();
  done();
});

// Ensures the 'scripts' task is complete before reloading browsers.
gulp.task('scripts:watch', ['scripts'], done => {
  browserSync.reload();
  done();
});

// Development.
// Watches files for changes.
gulp.task('watch', () => {
  gulp.watch(paths.views.src, ['views:watch']);
  gulp.watch(paths.media.src, ['media']);
  gulp.watch(paths.styles.src, ['styles']);
  gulp.watch(paths.scripts.src[0], ['scripts:watch']);
});

//------------------------------------------------------------------------------
// Clean.
//------------------------------------------------------------------------------

// Deletes the output folder.
gulp.task('clean', () => del([dirs.output]));

//------------------------------------------------------------------------------
// Default.
//------------------------------------------------------------------------------

gulp.task('default', callback => {
  const compile = ['views', 'media', 'styles', 'scripts'];
  if (isProd) {
    // Production.
    runSequence('clean', compile, callback);
  } else {
    // Development.
    runSequence('clean', compile, 'serve', 'watch', callback);
  }
});
