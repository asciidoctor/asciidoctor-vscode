require 'asciidoctor' # <1>

Asciidoctor.convert_file 'doc.adoc', safe: :safe # <2>
puts 'done' # <3>