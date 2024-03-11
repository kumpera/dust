/* tslint:disable */
/* eslint-disable */
// @ts-nocheck
/**
 * Ampli - A strong typed wrapper for your Analytics
 *
 * This file is generated by Amplitude.
 * To update run 'ampli pull dust-node-prod'
 *
 * Required dependencies: @amplitude/analytics-node@^1.0.0
 * Tracking Plan Version: 2
 * Build: 1.0.0
 * Runtime: node.js:typescript-ampli-v2
 *
 * [View Tracking Plan](https://data.amplitude.com/dust-tt/dust-prod/events/main/latest)
 *
 * [Full Setup Instructions](https://data.amplitude.com/dust-tt/dust-prod/implementation/dust-node-prod)
 */

import * as amplitude from "@amplitude/analytics-node";

export type NodeClient = amplitude.Types.NodeClient;
export type BaseEvent = amplitude.Types.BaseEvent;
export type Event = amplitude.Types.Event;
export type EventOptions = amplitude.Types.EventOptions;
export type Result = amplitude.Types.Result;
export type NodeOptions = amplitude.Types.NodeOptions;

export type Environment = "dustprod";

export const ApiKey: Record<Environment, string> = {
  dustprod: "940c526d7c7c91a38c267be75c958890",
};

/**
 * Default Amplitude configuration options. Contains tracking plan information.
 */
export const DefaultConfiguration: NodeOptions = {
  plan: {
    version: "2",
    branch: "main",
    source: "dust-node-prod",
    versionId: "4e855190-0d49-4fdc-a164-e1e974880832",
  },
  ...{
    ingestionMetadata: {
      sourceName: "node.js-typescript-ampli",
      sourceVersion: "2.0.0",
    },
  },
};

export interface LoadOptionsBase {
  disabled?: boolean;
}

export type LoadOptionsWithEnvironment = LoadOptionsBase & {
  environment: Environment;
  client?: { configuration?: NodeOptions };
};
export type LoadOptionsWithApiKey = LoadOptionsBase & {
  client: { apiKey: string; configuration?: NodeOptions };
};
export type LoadOptionsWithClientInstance = LoadOptionsBase & {
  client: { instance: NodeClient };
};

export type LoadOptions =
  | LoadOptionsWithEnvironment
  | LoadOptionsWithApiKey
  | LoadOptionsWithClientInstance;

export interface IdentifyProperties {
  email?: string;
  SignupDate?: string;
}

export interface UserMessagePostedProperties {
  conversationId: string;
  isGlobalAgent: boolean;
  mentions: any;
  /**
   * | Rule | Value |
   * |---|---|
   * | Type | integer |
   */
  mentionsCount: number;
  messageId: string;
  version: any;
  workspaceId: string;
  workspaceName: string;
}

export class Identify implements BaseEvent {
  event_type = amplitude.Types.SpecialEventType.IDENTIFY;

  constructor(public event_properties?: IdentifyProperties) {
    this.event_properties = event_properties;
  }
}

export class SignUp implements BaseEvent {
  event_type = "SignUp";
}

export class UserMessagePosted implements BaseEvent {
  event_type = "UserMessagePosted";

  constructor(public event_properties: UserMessagePostedProperties) {
    this.event_properties = event_properties;
  }
}

export type PromiseResult<T> = { promise: Promise<T | void> };

const getVoidPromiseResult = () => ({ promise: Promise.resolve() });

// prettier-ignore
export class Ampli {
  private disabled: boolean = false;
  private amplitude?: NodeClient;

  get client(): NodeClient {
    this.isInitializedAndEnabled();
    return this.amplitude!;
  }

  get isLoaded(): boolean {
    return this.amplitude != null;
  }

  private isInitializedAndEnabled(): boolean {
    if (!this.amplitude) {
      console.error('ERROR: Ampli is not yet initialized. Have you called ampli.load() on app start?');
      return false;
    }
    return !this.disabled;
  }

  /**
   * Initialize the Ampli SDK. Call once when your application starts.
   *
   * @param options Configuration options to initialize the Ampli SDK with.
   */
  load(options: LoadOptions): PromiseResult<void> {
    this.disabled = options.disabled ?? false;

    if (this.amplitude) {
      console.warn('WARNING: Ampli is already initialized. Ampli.load() should be called once at application startup.');
      return getVoidPromiseResult();
    }

    let apiKey: string | null = null;
    if (options.client && 'apiKey' in options.client) {
      apiKey = options.client.apiKey;
    } else if ('environment' in options) {
      apiKey = ApiKey[options.environment];
    }

    if (options.client && 'instance' in options.client) {
      this.amplitude = options.client.instance;
    } else if (apiKey) {
      this.amplitude = amplitude.createInstance();
      const configuration = (options.client && 'configuration' in options.client) ? options.client.configuration : {};
      return this.amplitude.init(apiKey, { ...DefaultConfiguration, ...configuration });
    } else {
      console.error("ERROR: ampli.load() requires 'environment', 'client.apiKey', or 'client.instance'");
    }

    return getVoidPromiseResult();
  }

  /**
   * Identify a user and set user properties.
   *
   * @param userId The user's id.
   * @param properties The user properties.
   * @param options Optional event options.
   */
  identify(
    userId: string | undefined,
    properties?: IdentifyProperties,
    options?: EventOptions,
  ): PromiseResult<Result> {
    if (!this.isInitializedAndEnabled()) {
      return getVoidPromiseResult();
    }

    if (userId) {
      options = {...options,  user_id: userId};
    }

    const amplitudeIdentify = new amplitude.Identify();
    const eventProperties = properties;
    if (eventProperties != null) {
      for (const [key, value] of Object.entries(eventProperties)) {
        amplitudeIdentify.set(key, value);
      }
    }

    return this.amplitude!.identify(amplitudeIdentify, options);
  }

  /**
   * Track event
   *
   * @param userId The user's id.
   * @param event The event to track.
   * @param options Optional event options.
   */
  track(userId: string | undefined, event: Event, options?: EventOptions): PromiseResult<Result> {
    if (!this.isInitializedAndEnabled()) {
      return getVoidPromiseResult();
    }

    if (userId) {
      options = {...options,  user_id: userId};
    }

    return this.amplitude!.track(event, undefined, options);
  }

  flush(): PromiseResult<void> {
    if (!this.isInitializedAndEnabled()) {
      return getVoidPromiseResult();
    }

    return this.amplitude!.flush();
  }

  /**
   * SignUp
   *
   * [View in Tracking Plan](https://data.amplitude.com/dust-tt/dust-prod/events/main/latest/SignUp)
   *
   * Event has no description in tracking plan.
   *
   * @param userId The user's ID.
   * @param options Amplitude event options.
   */
  signUp(
    userId: string | undefined,
    options?: EventOptions,
  ) {
    return this.track(userId, new SignUp(), options);
  }

  /**
   * UserMessagePosted
   *
   * [View in Tracking Plan](https://data.amplitude.com/dust-tt/dust-prod/events/main/latest/UserMessagePosted)
   *
   * Event has no description in tracking plan.
   *
   * @param userId The user's ID.
   * @param properties The event's properties (e.g. conversationId)
   * @param options Amplitude event options.
   */
  userMessagePosted(
    userId: string | undefined,
    properties: UserMessagePostedProperties,
    options?: EventOptions,
  ) {
    return this.track(userId, new UserMessagePosted(properties), options);
  }
}

export const ampli = new Ampli();
