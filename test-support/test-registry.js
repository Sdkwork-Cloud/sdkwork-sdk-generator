const rootSuite = createSuite('(root)', null);
const suiteStack = [rootSuite];

function createSuite(name, parent) {
  return {
    name,
    parent,
    suites: [],
    tests: [],
    afterEachHooks: [],
  };
}

function currentSuite() {
  return suiteStack[suiteStack.length - 1];
}

export function describe(name, definition) {
  const suite = createSuite(String(name || 'unnamed suite'), currentSuite());
  currentSuite().suites.push(suite);
  suiteStack.push(suite);
  try {
    definition();
  } finally {
    suiteStack.pop();
  }
}

describe.skip = function skipDescribe() {
};

export function it(name, definition) {
  currentSuite().tests.push({
    name: String(name || 'unnamed test'),
    definition,
    skipped: false,
  });
}

it.skip = function skipIt(name) {
  currentSuite().tests.push({
    name: String(name || 'unnamed test'),
    definition: async () => {},
    skipped: true,
  });
};

export const test = it;
export const suite = describe;

export function afterEach(hook) {
  currentSuite().afterEachHooks.push(hook);
}

function collectAfterEachHooks(suiteNode) {
  const hooks = [];
  let current = suiteNode;
  while (current) {
    hooks.push(...current.afterEachHooks);
    current = current.parent;
  }
  return hooks;
}

function collectSuitePath(suiteNode) {
  const names = [];
  let current = suiteNode;
  while (current && current.parent) {
    names.unshift(current.name);
    current = current.parent;
  }
  return names;
}

async function runTest(testNode, suiteNode, stats) {
  const fullName = [...collectSuitePath(suiteNode), testNode.name].join(' > ');
  stats.total += 1;

  if (testNode.skipped) {
    stats.skipped += 1;
    console.log(`- ${fullName} (skipped)`);
    return;
  }

  let failure;
  try {
    await testNode.definition();
  } catch (error) {
    failure = error;
  } finally {
    const hooks = collectAfterEachHooks(suiteNode);
    for (const hook of hooks) {
      try {
        await hook();
      } catch (hookError) {
        if (!failure) {
          failure = hookError;
        }
      }
    }
  }

  if (failure) {
    stats.failed += 1;
    console.error(`x ${fullName}`);
    console.error(formatError(failure));
    return;
  }

  stats.passed += 1;
  console.log(`ok ${fullName}`);
}

async function runSuite(suiteNode, stats) {
  for (const childSuite of suiteNode.suites) {
    await runSuite(childSuite, stats);
  }
  for (const testNode of suiteNode.tests) {
    await runTest(testNode, suiteNode, stats);
  }
}

function formatError(error) {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
}

export async function runRegisteredTests() {
  const stats = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  await runSuite(rootSuite, stats);

  console.log('');
  console.log(`Tests: ${stats.passed} passed, ${stats.failed} failed, ${stats.skipped} skipped, ${stats.total} total`);

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}
