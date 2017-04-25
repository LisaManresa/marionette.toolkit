import _ from 'underscore';
import Marionette from 'backbone.marionette';
import StateMixin from './mixins/state';
import ChildAppsMixin from './mixins/child-apps';
import EventListenersMixin from './mixins/event-listeners';

const ClassOptions = [
  'startWithParent',
  'stopWithParent',
  'startAfterInitialized',
  'preventDestroy',
  'StateModel',
  'stateEvents'
];

/**
 * Marionette.Application with an `initialize` / `start` / `stop` / `destroy` lifecycle.
 *
 * @public
 * @class App
 * @memberOf Toolkit
 * @memberOf Marionette
 */
const App = Marionette.Application.extend({

  /**
   * Internal flag indiciate when `App` has started but has not yet stopped.
   *
   * @private
   * @type {Boolean}
   * @default false
   */
  _isRunning: false,

  /**
   * Set to true if a parent `App` should not be able to destroy this `App`.
   *
   * @type {Boolean|Function}
   * @default false
   */
  preventDestroy: false,

  /**
   * Set to true if `App` should be started after it is initialized.
   *
   * @type {Boolean|Function}
   * @default false
   */
  startAfterInitialized: false,

  /**
   * Set to true if `App` should be started after its parent starts.
   *
   * @type {Boolean|Function}
   * @default false
   */
  startWithParent: false,

  /**
   * Set to false if `App` should not stop after its parent stops.
   *
   * @type {Boolean|Function}
   * @default true
   */
  stopWithParent: true,

  /**
   * @public
   * @constructs App
   * @param {Object} [options] - Settings for the App.
   * @param {Boolean} [options.startWithParent]
   * @param {Boolean} [options.stopWithParent]
   * @param {Boolean} [options.startAfterInitialized]
   * @param {Boolean} [options.preventDestroy]
   * @param {Object} [options.state] - Attributes to set on the state model.
   */
  constructor(options = {}) {
    this.mergeOptions(options, ClassOptions);

    // ChildAppsMixin
    this._initChildApps(options);

    Marionette.Application.call(this, options);

    if(_.result(this, 'startAfterInitialized')) {
      this.start(options);
    }
  },

  /**
   * Internal helper to verify if `App` has been destroyed
   *
   * @private
   * @method _ensureAppIsIntact
   * @memberOf App
   * @throws AppDestroyedError - Thrown if `App` has already been destroyed
   */
  _ensureAppIsIntact() {
    if(this._isDestroyed) {
      throw new Marionette.Error({
        name: 'AppDestroyedError',
        message: 'App has already been destroyed and cannot be used.'
      });
    }
  },

  /**
   * Gets the value of internal `_isRunning` flag
   *
   * @public
   * @method isRunning
   * @memberOf App
   * @returns {Boolean}
   */
  isRunning() {
    return this._isRunning;
  },

  /**
   * Gets the value of internal `_isRestarting` flag
   *
   * @public
   * @method isRestarting
   * @memberOf App
   * @returns {Boolean}
   */
  isRestarting() {
    return this._isRestarting;
  },

  /**
   * Sets the app lifecycle to running.
   *
   * @public
   * @method start
   * @memberOf App
   * @param {Object} [options] - Settings for the App passed through to events
   * @event App#before:start - passes options
   * @returns {App}
   */
  start(options = {}) {
    this._ensureAppIsIntact();

    if(this._isRunning) {
      return this;
    }

    this.setRegion(options.region);

    // StateMixin
    this._initState(options);

    this.triggerMethod('before:start', options);

    this._isRunning = true;

    // StateMixin
    this.delegateStateEvents();

    this.triggerStart(options);

    return this;
  },


  /**
   * Sets the app lifecycle to not running
   * then sets the app lifecycle to running with ending state
   *
   * @public
   * @method restart
   * @memberOf App
   * @returns {App}
   */
  restart() {
    const state = this.getState().attributes;

    this._isRestarting = true;
    this.stop().start({ state });
    this._isRestarting = false;

    return this;
  },

  /**
   * Set the Application's Region after instantiation
   *
   * @public
   * @method setRegion
   * @memberOf App
   * @param {Region} [region] - Region to use with the app
   * @returns {App}
   */

  setRegion(region) {
    if(!region) {
      return this;
    }

    this._region = region;

    return this;
  },

  /**
   * Triggers start event.
   * Override to introduce async start
   *
   * @public
   * @method triggerStart
   * @memberOf App
   * @param {Object} [options] - Settings for the App passed through to events
   * @event App#start - passes options
   * @returns
   */
  triggerStart(options) {
    this.triggerMethod('start', options);
  },

  /**
   * Sets the app lifecycle to not running.
   * Removes any listeners added during the running state
   *
   * @public
   * @method stop
   * @memberOf App
   * @param {Object} [options] - Settings for the App passed through to events
   * @event App#before:stop - passes options
   * @event App#stop - passes options
   * @returns {App}
   */
  stop(options) {
    if(!this._isRunning) {
      return this;
    }

    this.triggerMethod('before:stop', options);

    this._isRunning = false;

    this.triggerMethod('stop', options);

    // Running events are cleaned up after stop so that
    // `stop` event handlers still fire
    this._stopRunningListeners();
    this._stopRunningEvents();

    return this;
  },

  /**
   * Stops the `App` and sets it destroyed.
   *
   * @public
   * @method destroy
   * @memberOf App
   */
  destroy() {
    if(this._isDestroyed) {
      return this;
    }

    this.stop();

    Marionette.Object.prototype.destroy.apply(this, arguments);

    return this;
  },

  /**
   * Shows a view in the region of the app's view
   *
   * @public
   * @method showChildView
   * @param {String} regionName - Name of region to show in
   * @param {View} view - Child view instance
   * @param {...args} Additional args that get passed along
   * @returns {View} - Child view instance
   */
  showChildView(regionName, view, ...args) {
    const appView = this.getView();

    if(!appView) {
      return false;
    }

    appView.showChildView(regionName, view, ...args);

    return view;
  },

  /**
   * Returns view from the App view by region name.
   *
   * @public
   * @method getChildView
   * @param {String} regionName - Name of region to get view from
   * @returns {View}
   */
  getChildView(regionName) {
    const appView = this.getView();

    if(!appView) {
      return false;
    }

    return appView.getChildView(regionName);
  }
});

_.extend(App.prototype, StateMixin, ChildAppsMixin, EventListenersMixin);

export default App;
