class TestFailure(Exception):
    pass

def log_test_start(test_name):
    print '--> Starting test:\t' + test_name

def log_test_end(test_name, verdict):
    if (verdict):
        verdict = 'Passed'
    else:
        verdict = 'FAILED'
    print '--> Test complete:\t' + verdict + test_name
