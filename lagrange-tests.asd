(in-package :asdf-user)
(defsystem "lagrange-tests"
  :description "Test suite for the lagrange system"
  :author "psvensson <psvensson@mail.com>"
  :version "0.0.1"
  :depends-on (:lagrange
               :fiveam)
  :license "BSD"
  :serial t
  :components ((:module "tests"
                        :serial t
                        :components ((:file "packages")
                                     (:file "test-lagrange"))))

  ;; The following would not return the right exit code on error, but still 0.
  ;; :perform (test-op (op _) (symbol-call :fiveam :run-all-tests))
  )
