var services;

function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results === null ? null : decodeURIComponent(results[1].replace(/\+/g, " "));
}


function toggleFeatures(featuresStr) {
	var features = featuresStr.toLowerCase();
	
	$('.nav .tab').hide();
	
	if ( features.indexOf('a') > -1 ) {
		$('#auth-button').show();
	}
	if ( features.indexOf('i') > -1 ) {
		$('#integrations-button').show();
	}
	if ( features.indexOf('t') > -1 ) {
		$('#trigger-button').show();
	}
	if ( features.indexOf('n') > -1 ) {
		$('#incidents-button').show();
	}
	if ( features.indexOf('u') > -1 ) {
		$('#users-button').show();
	}
	if ( features.indexOf('d') > -1 ) {
		$('#addons-button').show();
	}
}

function PDRequest(endpoint, method, options) {

	var token = $('#token').val();

	var merged = $.extend(true, {}, {
		type: method,
		dataType: "json",
		url: "https://api.pagerduty.com/" + endpoint,
		headers: {
			"Authorization": "Token token=" + token,
			"Accept": "application/vnd.pagerduty+json;version=2"
		},
		error: function(err) {
			$('.busy').hide();
			alert('Error ' + err.status + ': ' + err.statusText + ' - please check the values in the Authentication tab.');
		}
	},
	options);

	$.ajax(merged);
}

function PDEvent(options) {
	
	var token = $('#token').val();

	$.ajax($.extend({}, {
		type: "POST",
		dataType: "json",
		url: "https://events.pagerduty.com/generic/2010-04-15/create_event.json",
	},
	options));

}

function populateIntegrationsMenu() {
	$('#integrations-integration-select').html('');
	services[$('#integrations-service-select').val()].integrations.forEach(function(integration) {
		$('#integrations-integration-select').append($('<option/>', {
			value: integration.id,
			text: integration.summary
		}));
	});
	$('#integrations-integration-select').selectpicker('refresh');
	populateIntegrationsResult();
}

function populateIntegrationsResult() {
	$('#integrations-result').html('');
	var serviceID = $('#integrations-service-select').val();
	var integrationID = $('#integrations-integration-select').val();
	var options = {
		success: function(data) {
			$('#integrations-result').JSONView(data);
		}
	}
	PDRequest("/services/" + serviceID + "/integrations/" + integrationID, "GET", options);
}

// find all the generic API integrations, then get the integration keys from those
function populateTriggerSelect(data) {
	var integrationIDs = [];
	async.series([
		function(callback) {
			data.services.forEach(function(service) {
				service.integrations.forEach(function(integration) {
					if ( integration.type.includes("api_inbound") || integration.type.includes("nagios_inbound") ) {
						integrationIDs.push([service.id, integration.id]);
					}
				});
			});
			callback(null, integrationIDs);
		},
		
		function(callback) {
			var infoFns = [];
			integrationIDs.forEach(function(integrationID) {
				infoFns.push(function(callback) {
					var options = {
						success: function(integrationInfo) {
							callback(null, integrationInfo);
						}
					}
					PDRequest("services/" + integrationID[0] + "/integrations/" + integrationID[1], "GET", options);
				});
			});
			async.parallel(infoFns, 
				function(err, results) {
					results.forEach(function(result) {
						$('#trigger-dest-select').append($('<option/>', {
							value: result.integration.integration_key,
							text: result.integration.service.summary + ": " + result.integration.name
						}));
					});
					$('#trigger-dest-select').selectpicker('refresh');
					$('.busy').hide();
			});
		}
	]);
}

function populateIncidentsResult() {
	$('#incidents-result').html('');
	$('#incidents-result').append($('<table/>', {
		id: "incidents-result-table"
	}));
	
	$('#incidents-result-table').on('click', 'td button.resolve-button', function() {
		var incidentID = $(this).attr('id');
		var requestData = {
				incident: {
					type: "incident",
					status: "resolved",
					resolution: "PDtool"					}
			};

		var options = {
			headers: { "From": $('#userid').val() },
			data: requestData,
			success: function(data) {
				populateIncidentsResult();
			}
		}
		PDRequest("incidents/" + incidentID, "PUT", options);

	});
	
	$('#incidents-result-table').on('click', 'td button.ack-button', function() {
		var incidentID = $(this).attr('id');
		var requestData = {
				incident: {
					type: "incident",
					status: "acknowledged",
					resolution: "PDtool"					}
			};

		var options = {
			headers: { "From": $('#userid').val() },
			data: requestData,
			success: function(data) {
				populateIncidentsResult();
			}
		}
		PDRequest("incidents/" + incidentID, "PUT", options);

	});
	
	var options = {
		success: function(data) {
			var tableData = [];
			data.incidents.forEach(function(incident) {
				var actionButtons = '<button class="btn btn-sm resolve-button" id="' + incident.id + '">Resolve</button>';
				if ( incident.status == "triggered" ) {
					actionButtons += ' <button class="btn btn-sm ack-button" id="' + incident.id + '">Ack</button>';
				}
				tableData.push(
					[
						'<a href="' + incident.html_url + '" target="blank">' + incident.incident_number + '</a>',
						(new Date(incident.created_at)).toLocaleString(),
						incident.status,
						incident.service.summary,
						incident.summary,
						actionButtons
						
					]
				);
			});
			$('#incidents-result-table').DataTable({
				data: tableData,
				columns: [
					{ title: "#" },
					{ title: "Created at" },
					{ title: "Status" },
					{ title: "Service Name" },
					{ title: "Summary" },
					{ title: "Actions" }
				]
			});
		},
		data: {
			"statuses[]": ["triggered","acknowledged"]
		}
	}
	PDRequest("incidents", "GET", options);
}

function processUsers(tableData, data) {
	data.users.forEach(function(user) {
		var methods = {
			phone: [],
			email: [],
			sms: [],
			push: []
		}
		
		user.contact_methods.forEach(function(method) {
			switch (method.type) {
				case "email_contact_method":
					methods.email.push(method.address);
					break;
				case "phone_contact_method":
					methods.phone.push(method.address);
					break;
				case "push_notification_contact_method":
					methods.push.push(method.address);
					break;
				case "sms_contact_method":
					methods.sms.push(method.address);
					break;
			}
		});
		
		var teams = [];
		user.teams.forEach(function(team) {
			teams.push(team.summary);
		});
		
		tableData.push(
			[
				user.name,
				user.email,
				user.job_title,
				user.role,
				teams.join(),
				methods.email.join(),
				methods.phone.join(),
				methods.sms.join()
			]
		);
	});
	if ( data.more == true ) {
		var offset = data.offset + data.limit;
		var progress = Math.round((data.offset / data.total) * 100);
		$('#progressbar').attr("aria-valuenow", "" + progress);
		$('#progressbar').attr("style", "width: " + progress + "%;");
		$('#progressbar').html("" + progress + "%");
		
		var options = {
			data: {
				"include[]": ["contact_methods"],
				"offset": offset,
				"total": "true"
			},
			success: function(data) { processUsers(tableData, data); }
		}
		
		PDRequest("users", "GET", options);
	} else {
		$('#users-result-table').DataTable({
			data: tableData,
			columns: [
				{ title: "User Name" },
				{ title: "Login"},
				{ title: "Title"},
				{ title: "PD Role"},
				{ title: "Teams"},
				{ title: "Contact email" },
				{ title: "Contact phone" },
				{ title: "Contact sms" },
			],
			dom: 'Bfrtip',
			buttons: [
				'copy', 'csv', 'excel', 'pdf', 'print'
			]
		});
		$('.busy').hide();
		$('#progressbar').attr("aria-valuenow", "0");
		$('#progressbar').attr("style", "width: 0%;");
		$('#progressbar').html("0%");
	}
}

function populateUsersResult() {
	$('.busy').show();
	$('#users-result').html('');
	$('#users-result').append($('<table/>', {
		id: "users-result-table"
	}));
	
	var tableData = [];
	var options = {
		data: {
			"include[]": ["contact_methods"],
			"total": "true"
		},
		success: function(data) { processUsers(tableData, data); }
	}
	
	PDRequest("users", "GET", options);
}

function processAddons(tableData, data) {

	data.addons.forEach(function(addon) {
		var actionButtons = '<button class="btn btn-sm delete-button" id="' + addon.id + '">Delete</button>';
		
		
		var desc = addon.summary;
		if ( addon.html_url ) {
			desc = '<a href="' + addon.html_url + '" target="blank">' + desc + '</a>'
		}

		tableData.push([
			desc,
			addon.type,
			addon.src,
			actionButtons
		]);
	});
	
	if (data.more == true) {
		var offset = data.offset + data.limit;
		var options = {
			data: {
				"offset": offset,
				"total": "true"
			},
			success: function(data) { processAddons(tableData, data); }
		}
		PDRequest("addons", "GET", options);
	} else {
		$('#addons-result-table').DataTable({
			data: tableData,
			columns: [
				{ title: "Description" },
				{ title: "Type"},
				{ title: "URL"},
				{ titls: "Actions"}
			]
		});
		$('.busy').hide();		
		$('#addons-result-table').on('click', 'td button.delete-button', function() {
			var addonID = $(this).attr('id');
	
			var options = {
				success: function(data) {
					populateAddonsResult();
				}
			}
			PDRequest("addons/" + addonID, "DELETE", options);
		});
	}
}

function populateAddonsResult() {
	$('.busy').show();
	$('#addons-result').html('');
	$('#addons-result').append($('<table/>', {
		id: "addons-result-table"
	}));
	
	var tableData = [];
	var options = {
		success: function(data) { processAddons(tableData, data) },
		total: true
	}
	
	PDRequest("addons", "GET", options);
}


function main() {

	// prepopulate token field if it's been saved
	$("#token").val(localStorage.getItem("token"));
	$("#userid").val(localStorage.getItem("userid"));
	
	// silently save the token if the user types something in
	$('#token').change(function() {
		localStorage.setItem('token', $('#token').val());
	});
	$('#userid').change(function() {
		localStorage.setItem('userid', $('#userid').val());
	});
	
	if ( getParameterByName("token") ) {
		$("#token").val(getParameterByName("token"));
	}

	if ( getParameterByName("userid") ) {
		$("#userid").val(getParameterByName("userid"));
	}
	
	if ( getParameterByName("features") ) {
		toggleFeatures(getParameterByName("features"));
	}

	$('.selectpicker').selectpicker();
	
	// when you change the service select, show the integrations for the selected service
	$('#integrations-service-select').change(function() {
		populateIntegrationsMenu();
	});
	
	// when you change the selected integration, get the details of the selected integration
	$('#integrations-integration-select').change(function() {
		populateIntegrationsResult();
	});
	
	// active 'tab' highlight
	$('.nav li').click(function() {
		$('nav li').removeClass("active");
		$(this).addClass("active");
	})

	//show integrations page
	$('#integrations-button').click(function() {
		$('.detail').hide();
		$('#integrations').show();
		
		var options = {
			success: function(data) {
				$('#integrations-service-select').html('');
				services = {};
				data.services.forEach(function(service) {
					services[service.id] = service;
					$('#integrations-service-select').append($('<option/>', {
						value: service.id,
						text: service.name
					}));
				});
				$('#integrations-service-select').selectpicker('refresh');
				populateIntegrationsMenu();
				populateIntegrationsResult();
			}
		};
		PDRequest("services", "GET", options);

	});
	
	// show trigger page
	$('#trigger-button').click(function() {
		$('.detail').hide();
		$('#trigger').show();
		$('.busy').show();
		$('#trigger-dest-select').html('');
		var options = {
			success: function(data) {
				populateTriggerSelect(data);
			}
		};
		$('.busy').show();
		PDRequest("services", "GET", options);
	});
	
	$('#incidents-button').click(function() {
		$('.detail').hide();
		$('#incidents').show();
		populateIncidentsResult();
	});

	$('#auth-button').click(function() {
		$('.detail').hide();
		$('#auth').show();
		populateIncidentsResult();
	});
	
	$('#users-button').click(function() {		
		$('.detail').hide();
		$('#users').show();
		populateUsersResult();
	});
	
	$('#addons-view-button').click(function() {
		$('.detail').hide();
		$('#addons').show();
		populateAddonsResult();
	});
	
	$('#addons-add-button').click(function() {
		$('.detail').hide();
		$('#addons-add').show();
	});
	
	$('#addons-install-button').click(function() {
		var options = {
			data: {
				addon: {
					name: $('#addons-name').val(),
					type: $('#addons-type').val(),
					src: $('#addons-url').val()
				}
			},
			success: function() {
//				populateAddonsResult();
				$('#addons-add-result').append('Installed addon "' + $('#addons-name').val() + '" (' + $('#addons-url').val() + ')');
			}
		}
		
		PDRequest("addons", "POST", options);
	});

	// send trigger button
	$('#trigger-send-button').click(function() {
		var eventData = $.extend(PDtoolevents[$('#trigger-event-select').val()].event, { "service_key": $('#trigger-dest-select').val() });
		var options = {
			success: function() {
				$('#trigger-result').append($('#trigger-event-select').val() + " event sent to " + 
								$("#trigger-dest-select option:selected").text() + "<br>");
			},
			data: JSON.stringify(eventData)
		}
		PDEvent(options);
	});
	
	// put pre-canned events into the select in the trigger page
	var keys = Object.keys(PDtoolevents);
	keys.sort();
	keys.forEach(function(event) {
		$('#trigger-event-select').append($('<option/>', {
			value: event,
			text: event
		}));
	});
	$('#trigger-event-select').selectpicker('refresh');
}

$(document).ready(main);
