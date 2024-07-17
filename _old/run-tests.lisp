
(load "lagrange.asd")
(load "lagrange-tests.asd")

(ql:quickload "lagrange-tests")

(in-package :lagrange-tests)

(uiop:quit (if (run-all-tests) 0 1))
