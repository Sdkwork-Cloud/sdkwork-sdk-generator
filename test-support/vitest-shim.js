import * as chai from 'chai';
import {
  ASYMMETRIC_MATCHERS_OBJECT,
  GLOBAL_EXPECT,
  JestAsymmetricMatchers,
  JestChaiExpect,
  JestExtend,
  addCustomEqualityTesters,
  getState,
  setState,
} from '@vitest/expect';

import { afterEach, describe, it, suite, test } from './test-registry.js';

chai.use(JestExtend);
chai.use(JestChaiExpect);
chai.use(JestAsymmetricMatchers);

export function createSandboxExpect() {
  const expect = (value, message) => {
    const currentState = getState(expect) || { assertionCalls: 0 };
    setState({
      ...currentState,
      assertionCalls: (currentState.assertionCalls || 0) + 1,
      soft: false,
    }, expect);
    return chai.expect(value, message);
  };

  Object.assign(expect, chai.expect);
  Object.assign(expect, globalThis[ASYMMETRIC_MATCHERS_OBJECT]);

  expect.getState = () => getState(expect);
  expect.setState = (state) => setState(state, expect);
  expect.extend = (matchers) => chai.expect.extend(expect, matchers);
  expect.addEqualityTesters = (customTesters) => addCustomEqualityTesters(customTesters);
  expect.soft = (...args) => {
    const assertion = expect(...args);
    expect.setState({
      ...(expect.getState() || {}),
      soft: true,
    });
    return assertion;
  };
  expect.unreachable = (message) => {
    chai.assert.fail(`expected${message ? ` "${message}" ` : ' '}not to be reached`);
  };

  setState({
    assertionCalls: 0,
    isExpectingAssertions: false,
    isExpectingAssertionsError: null,
    expectedAssertionsNumber: null,
    expectedAssertionsNumberErrorGen: null,
    environment: 'node',
    testPath: '',
    currentTestName: '',
  }, expect);

  return expect;
}

export const expect = createSandboxExpect();

Object.defineProperty(globalThis, GLOBAL_EXPECT, {
  value: expect,
  writable: true,
  configurable: true,
});

export {
  afterEach,
  describe,
  it,
  suite,
  test,
};
