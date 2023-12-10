(in-package :asdf-user)

(defsystem "lagrange"
  :author "psvensson <psvensson@mail.com>"
  :version "0.0.1"
  :license "MIT"
  :description ""
  :homepage ""
  :bug-tracker ""
  :source-control (:git "")

  ;; Dependencies.
  :depends-on ()

  ;; Project stucture.
  :serial t
  :components ((:module "src"
                        :serial t
                        :components ((:file "packages")
                                     (:file "lagrange"))))

  ;; Build a binary:
  ;; don't change this line.
  :build-operation "program-op"
  ;; binary name: adapt.
  :build-pathname "lagrange"
  ;; entry point: here "main" is an exported symbol. Otherwise, use a double ::
  :entry-point "lagrange:main")
